// API Service
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_URL || 'https://auth.milkt.art';
const APP_SLUG = import.meta.env.VITE_APP_SLUG;

class ApiService {
  async request(endpoint, options = {}, baseUrl = API_BASE_URL) {
    const url = `${baseUrl}${endpoint}`;

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
        // On 401, attempt a silent token refresh then retry once
        if (response.status === 401 && !options._isRetry) {
          const refreshed = await authAPI.refresh();
          if (refreshed) {
            return this.request(endpoint, { ...options, _isRetry: true }, baseUrl);
          }
          // Refresh failed — redirect to login
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }

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

// Auth API — points at the standalone auth service (/auth/*)
export const authAPI = {
  async login(identifier, password) {
    const response = await fetch(`${AUTH_BASE_URL}/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password, appSlug: APP_SLUG }),
    });
    const data = await response.json();
    if (!response.ok) {
      const err = new Error(data.message || 'Login failed');
      err.statusCode = response.status;
      throw err;
    }
    return data.user;
  },

  async register(userData) {
    const response = await fetch(`${AUTH_BASE_URL}/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...userData, appSlug: APP_SLUG }),
    });
    const data = await response.json();
    if (!response.ok) {
      const err = new Error(data.message || 'Registration failed');
      err.statusCode = response.status;
      err.errors = data.errors;
      throw err;
    }
    // Response shape: { success: true, data: { user } }
    return data.data.user;
  },

  async logout() {
    await fetch(`${AUTH_BASE_URL}/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  },

  async verifySession() {
    try {
      const response = await fetch(`${AUTH_BASE_URL}/verify`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.authenticated ? data.user : null;
    } catch {
      return null;
    }
  },

  async refresh() {
    try {
      const response = await fetch(`${AUTH_BASE_URL}/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
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

  async executeImport(trips, companions, standalone, vouchers) {
    const response = await api.post('/users/import/execute', { trips, companions, standalone, vouchers });
    return response.data;
  },

  async deleteAllTripData() {
    const response = await api.delete('/users/data');
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
