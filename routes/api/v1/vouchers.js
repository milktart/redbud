/**
 * API v1 Vouchers Routes
 * RESTful JSON API for voucher management
 */

const express = require('express');
const apiResponse = require('../../../utils/apiResponse');
const { ensureAuthenticated } = require('../../../middleware/auth');

const router = express.Router();

// All voucher routes require authentication
router.use(ensureAuthenticated);

/**
 * GET /api/v1/vouchers
 * Retrieve all vouchers for the current user
 *
 * Returns all vouchers ordered by creation date (newest first)
 *
 * @returns {Object} 200 OK response with vouchers array
 * @returns {Array} returns - Array of voucher objects
 * @returns {string} returns[].id - Voucher ID (UUID)
 * @returns {string} returns[].userId - Associated user ID
 * @returns {string} returns[].type - Voucher type (e.g., TRAVEL_CREDIT, UPGRADE_CERT)
 * @returns {string} returns[].issuer - Issuing company/airline
 * @returns {string} returns[].voucherNumber - Voucher number
 * @returns {number} [returns[].totalValue] - Voucher value/amount
 * @returns {string} [returns[].expirationDate] - Expiry date (ISO format)
 * @returns {string} returns[].status - Voucher status (OPEN, USED, EXPIRED, etc.)
 * @returns {string} returns.createdAt - Creation date
 *
 * @throws {401} Unauthorized - User not authenticated
 * @throws {500} Server error - Database error
 *
 * @requires authentication - User must be logged in
 */
router.get('/', async (req, res) => {
  try {
    const { Voucher } = require('../../../models');

    // Get all vouchers for the current user
    const vouchers = await Voucher.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
    });

    return apiResponse.success(res, vouchers, `Retrieved ${vouchers.length} vouchers`);
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to retrieve vouchers', error);
  }
});

/**
 * POST /api/v1/vouchers
 * Create a new voucher for the current user
 *
 * @param {Object} req.body - Voucher data
 * @param {string} req.body.type - Voucher type (TRAVEL_CREDIT, UPGRADE_CERT, etc.)
 * @param {string} req.body.issuer - Issuing company/airline
 * @param {string} req.body.voucherNumber - Voucher number
 * @param {string} [req.body.associatedAccount] - Associated account (e.g., frequent flyer number)
 * @param {string} [req.body.pinCode] - PIN code
 * @param {string} [req.body.currency] - Currency code (default: USD)
 * @param {number} [req.body.totalValue] - Voucher value
 * @param {string} [req.body.expirationDate] - Expiration date (ISO format)
 * @param {string} [req.body.notes] - Additional notes
 *
 * @returns {Object} 201 Created response with new voucher
 *
 * @throws {400} Bad request - Missing required fields
 * @throws {401} Unauthorized - User not authenticated
 * @throws {500} Server error - Database error
 *
 * @requires authentication - User must be logged in
 */
router.post('/', async (req, res) => {
  try {
    const { Voucher } = require('../../../models');

    const voucherData = {
      ...req.body,
      userId: req.user.id,
    };

    const voucher = await Voucher.create(voucherData);

    return apiResponse.created(res, voucher, 'Voucher created successfully');
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to create voucher', error);
  }
});

/**
 * GET /api/v1/vouchers/:id
 * Get detailed information about a voucher
 *
 * @param {string} req.params.id - Voucher ID (UUID)
 *
 * @returns {Object} 200 OK response with voucher details
 * @returns {string} returns.id - Voucher ID
 * @returns {string} returns.tripId - Associated trip ID
 * @returns {string} returns.name - Voucher name
 * @returns {string} [returns.code] - Voucher code
 * @returns {string} [returns.description] - Description/notes
 * @returns {number} [returns.value] - Monetary value or discount amount
 * @returns {string} [returns.currency] - Currency code (e.g., USD, EUR)
 * @returns {string} [returns.expiryDate] - Expiry date (ISO format)
 * @returns {boolean} [returns.isUsed] - Whether voucher has been used
 * @returns {string} [returns.attachments] - File paths or URLs for voucher images
 * @returns {string} returns.createdAt - Creation timestamp (ISO format)
 * @returns {string} returns.createdBy - User ID of creator
 *
 * @throws {401} Unauthorized - User not authenticated
 * @throws {404} Not found - Voucher not found
 * @throws {500} Server error - Database error
 *
 * @requires authentication - User must be logged in
 */
router.get('/:id', async (req, res) => {
  try {
    const { Voucher } = require('../../../models');
    const voucher = await Voucher.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!voucher) {
      return apiResponse.notFound(res, 'Voucher not found');
    }

    return apiResponse.success(res, voucher, 'Voucher retrieved successfully');
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to retrieve voucher', error);
  }
});

// POST /api/v1/vouchers/trips/:tripId endpoint removed - use POST /api/v1/vouchers with tripId in body instead

/**
 * PUT /api/v1/vouchers/:id
 * Update an existing voucher
 *
 * @param {string} req.params.id - Voucher ID (UUID)
 * @param {Object} req.body - Request body with updatable fields
 * @param {string} [req.body.name] - Updated name
 * @param {string} [req.body.code] - Updated code
 * @param {string} [req.body.description] - Updated description
 * @param {number} [req.body.value] - Updated value
 * @param {string} [req.body.currency] - Updated currency
 * @param {string} [req.body.expiryDate] - Updated expiry date
 * @param {boolean} [req.body.isUsed] - Updated used status
 * @param {Array} [req.body.attachments] - Updated attachments
 *
 * @returns {Object} 200 OK response with updated voucher
 * @returns {string} returns.id - Voucher ID
 * @returns {string} returns.name - Updated name
 * @returns {string} returns.updatedAt - Update timestamp
 *
 * @throws {401} Unauthorized - User not authenticated
 * @throws {404} Not found - Voucher not found
 * @throws {500} Server error - Database error
 *
 * @requires authentication - User must be logged in
 */
router.put('/:id', async (req, res) => {
  try {
    const { Voucher } = require('../../../models');
    const voucher = await Voucher.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!voucher) {
      return apiResponse.notFound(res, 'Voucher not found');
    }

    // Update voucher
    const updated = await voucher.update(req.body);

    return apiResponse.success(res, updated, 'Voucher updated successfully');
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to update voucher', error);
  }
});

/**
 * DELETE /api/v1/vouchers/:id
 * Delete a voucher
 *
 * Soft delete of voucher record
 * Validates voucher exists before deletion
 *
 * @param {string} req.params.id - Voucher ID (UUID)
 *
 * @returns {Object} 204 No Content - successful deletion (no response body)
 *
 * @throws {401} Unauthorized - User not authenticated
 * @throws {404} Not found - Voucher not found
 * @throws {500} Server error - Database error
 *
 * @requires authentication - User must be logged in
 */
router.delete('/:id', async (req, res) => {
  try {
    const { Voucher } = require('../../../models');
    const voucher = await Voucher.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!voucher) {
      return apiResponse.notFound(res, 'Voucher not found');
    }

    await voucher.destroy();

    return apiResponse.noContent(res);
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to delete voucher', error);
  }
});

module.exports = router;
