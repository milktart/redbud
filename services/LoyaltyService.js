const BaseService = require('./BaseService');
const { LoyaltyProgram } = require('../models');

class LoyaltyService extends BaseService {
  constructor() {
    super(LoyaltyProgram);
  }

  async getMyPrograms(userId) {
    return this.findAll({ userId }, { order: [['programName', 'ASC']] });
  }

  async addProgram(userId, data) {
    const { programName, memberNumber, category, accountFirstName, accountLastName } = data;
    if (!programName || !memberNumber) {
      throw new Error('Program name and member number are required');
    }
    return this.create({ userId, programName, memberNumber, category: category || 'other', accountFirstName: accountFirstName || null, accountLastName: accountLastName || null });
  }

  async updateProgram(id, userId, data) {
    const record = await this.findByIdAndVerifyOwnership(id, userId);
    if (!record) {
      throw new Error('Loyalty program not found');
    }
    return this.update(record, data);
  }

  async deleteProgram(id, userId) {
    const record = await this.findByIdAndVerifyOwnership(id, userId);
    if (!record) {
      throw new Error('Loyalty program not found');
    }
    await this.delete(record);
  }
}

module.exports = LoyaltyService;
