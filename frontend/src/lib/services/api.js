// API Service
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

class ApiService {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const defaultOptions = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const config = { ...defaultOptions, ...options };

    if (options.headers) {
      config.headers = { ...defaultOptions.headers, ...options.headers };
    }

    try {
      const response = await fetch(url, config);
      const contentType = response.headers.get('content-type');
      const isJSON = contentType && contentType.includes('application/json');

      if (!response.ok) {
        const error = isJSON ? await response.json() : { message: 'Request failed' };
        const err = new Error(error.message || `HTTP error! status: ${response.status}`);
        err.statusCode = response.status;
        err.errors = error.errors;
        throw err;
      }

      return isJSON ? await response.json() : null;
    } catch (error) {
      throw error;
    }
  }

  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiService();

// Auth API
export const authAPI = {
  async login(identifier, password) {
    const response = await api.post('/auth/login', { identifier, password });
    return response.user;
  },

  async register(userData) {
    // userData may contain email or phone (or both); pass through as-is
    const response = await api.post('/auth/register', userData);
    return response.data.user;
  },

  async logout() {
    return await api.get('/auth/logout');
  },

  async verifySession() {
    try {
      const response = await api.get('/auth/verify-session');
      return response.user;
    } catch (error) {
      return null;
    }
  },
};

// Trip API
export const tripAPI = {
  async getAllTrips() {
    const response = await api.get('/trips?filter=all');
    // Response contains { trips: [...], standalone: [...] }
    return response.data ?? { trips: [], standalone: [] };
  },

  async getTripById(id) {
    const response = await api.get(`/trips/${id}`);
    return response.data;
  },

  async createTrip(tripData) {
    const response = await api.post('/trips', tripData);
    return response.data;
  },

  async updateTrip(id, tripData) {
    const response = await api.put(`/trips/${id}`, tripData);
    return response.data;
  },

  async deleteTrip(id) {
    return await api.delete(`/trips/${id}`);
  },
};

// Item API (Unified API for all travel items: flight, hotel, transportation, event, car_rental)
export const itemAPI = {
  async getAllItems(filters = {}) {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    if (filters.tripId) params.append('tripId', filters.tripId);

    const queryString = params.toString();
    const response = await api.get(`/item${queryString ? `?${queryString}` : ''}`);
    return response.data ?? [];
  },

  async getItemById(id) {
    const response = await api.get(`/item/${id}`);
    return response.data;
  },

  async createItem(itemData) {
    const response = await api.post('/item', itemData);
    return response.data;
  },

  async updateItem(id, itemData) {
    const response = await api.put(`/item/${id}`, itemData);
    return response.data;
  },

  async deleteItem(id) {
    return await api.delete(`/item/${id}`);
  },
};

// Users API
export const usersAPI = {
  async updateMe(profileData) {
    const response = await api.put('/users/me', profileData);
    return response.data?.user ?? response.user;
  },

  async exportData() {
    const url = `${API_BASE_URL}/users/export`;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = 'travel-data.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  },

  async importPreview(data) {
    const response = await api.post('/users/import/preview', data);
    return response.data;
  },

  async executeImport(trips) {
    const response = await api.post('/users/import/execute', { trips });
    return response.data;
  },
};

// Attendee API
export const attendeeAPI = {
  async getAttendees(itemType, itemId) {
    const response = await api.get(`/attendees?itemType=${encodeURIComponent(itemType)}&itemId=${encodeURIComponent(itemId)}`);
    return response.data ?? [];
  },

  async addAttendee(email, itemType, itemId) {
    const response = await api.post('/attendees', { email, itemType, itemId });
    return response.data;
  },

  async removeAttendee(attendeeId) {
    return await api.delete(`/attendees/${attendeeId}`);
  },
};

// Companion API
export const companionAPI = {
  async getMyCompanions() {
    const response = await api.get('/companions');
    return response.data ?? [];
  },

  async searchUsers(query) {
    if (!query || query.trim().length < 2) return [];
    try {
      const response = await api.get(`/users/search?q=${encodeURIComponent(query.trim())}`);
      return response.data?.users ?? response.data ?? [];
    } catch {
      return [];
    }
  },

  async lookupUserByIdentifier(identifier) {
    try {
      const response = await api.get(`/users/search?q=${encodeURIComponent(identifier)}`);
      const users = response.data?.users ?? response.data ?? [];
      const normalized = identifier.toLowerCase().trim();
      // Return exact match only (email or phone), non-phantom only
      return users.find(u =>
        (u.email && u.email.toLowerCase() === normalized) ||
        (u.phone && u.phone === normalized)
      ) ?? null;
    } catch {
      return null;
    }
  },

  async addCompanion(identifier, firstName, lastName, permissionLevel = 'view') {
    const response = await api.post('/companions', { identifier, firstName, lastName, permissionLevel });
    return response.data;
  },

  async updatePermission(companionUserId, permissionLevel) {
    const response = await api.put(`/companions/${companionUserId}`, { permissionLevel });
    return response.data;
  },

  async removeCompanion(companionUserId) {
    return await api.delete(`/companions/${companionUserId}`);
  },
};
