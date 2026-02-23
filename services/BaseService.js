/**
 * Base Service Class
 * Provides common database operations and patterns for all services
 * Phase 3 - Service Layer Pattern
 */

class BaseService {
  constructor(model, modelName) {
    this.model = model;
    this.modelName = modelName;
  }

  /**
   * Find a record by ID
   * @param {string|number} id - Record ID
   * @param {Object} options - Sequelize query options
   * @returns {Promise<Object|null>}
   */
  async findById(id, options = {}) {
    return this.model.findByPk(id, options);
  }

  /**
   * Find one record by criteria
   * @param {Object} where - Sequelize where clause
   * @param {Object} options - Additional query options
   * @returns {Promise<Object|null>}
   */
  async findOne(where, options = {}) {
    return this.model.findOne({ where, ...options });
  }

  /**
   * Find all records matching criteria
   * @param {Object} where - Sequelize where clause
   * @param {Object} options - Additional query options
   * @returns {Promise<Array>}
   */
  async findAll(where = {}, options = {}) {
    return this.model.findAll({ where, ...options });
  }

  /**
   * Create a new record
   * @param {Object} data - Record data
   * @param {Object} options - Sequelize options
   * @returns {Promise<Object>}
   */
  async create(data, options = {}) {
    return this.model.create(data, options);
  }

  /**
   * Update a record
   * @param {Object} record - Record instance to update
   * @param {Object} data - Updated data
   * @returns {Promise<Object>}
   */
  async update(record, data) {
    await record.update(data);
    return record;
  }

  /**
   * Delete a record
   * @param {Object} record - Record instance to delete
   * @returns {Promise<void>}
   */
  async delete(record) {
    await record.destroy();
  }

  /**
   * Count records matching criteria
   * @param {Object} where - Sequelize where clause
   * @returns {Promise<number>}
   */
  async count(where = {}) {
    return this.model.count({ where });
  }

  /**
   * Check if a record exists
   * @param {Object} where - Sequelize where clause
   * @returns {Promise<boolean>}
   */
  async exists(where) {
    const count = await this.count(where);
    return count > 0;
  }

  /**
   * Verify record ownership
   * @param {Object} record - Record instance
   * @param {string|number} userId - User ID to verify
   * @returns {boolean}
   */
  static verifyOwnership(record, userId) {
    if (!record) return false;
    return record.userId === userId;
  }

  /**
   * Find and verify ownership in one call
   * @param {string|number} id - Record ID
   * @param {string|number} userId - User ID to verify
   * @param {Object} options - Additional query options
   * @returns {Promise<Object|null>}
   */
  async findByIdAndVerifyOwnership(id, userId, options = {}) {
    const record = await this.findById(id, options);

    if (!record) {
      return null;
    }

    if (!BaseService.verifyOwnership(record, userId)) {
      return null;
    }

    return record;
  }
}

module.exports = BaseService;
