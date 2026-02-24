# Redbud UI Implementation

A simple, modular UI following the MVCS (Model-View-Controller-Service) architecture.

## Quick Start

### Running with Docker
```bash
# Clean build and start
docker-compose down -v
docker-compose up --build

# Access UI at http://localhost:3510
```

### Running Locally (without Docker)
```bash
# Install dependencies
npm install

# Start server
npm run dev

# Access UI at http://localhost:3002
```

## Project Structure

```
public/
├── index.html              # Landing page
├── login.html              # Login page
├── register.html           # Registration page
├── dashboard.html          # Dashboard with trips
├── css/
│   └── styles.css          # All styles
└── js/
    ├── models/
    │   ├── User.js         # User data model
    │   └── Trip.js         # Trip data model
    ├── services/
    │   ├── ApiService.js   # Base HTTP client
    │   ├── AuthService.js  # Authentication API
    │   └── TripService.js  # Trip management API
    ├── views/
    │   ├── AuthView.js     # Auth UI updates
    │   └── DashboardView.js # Dashboard UI updates
    └── controllers/
        ├── AuthController.js     # Login/register logic
        └── DashboardController.js # Dashboard logic
```

## Architecture: MVCS

### Model (Data Layer)
**Location**: `public/js/models/`

Represents data structures and business entities.

**User.js**:
```javascript
- id, email, firstName, lastName, isAdmin
- get fullName() → "First Last"
- static fromJSON(json) → User
```

**Trip.js**:
```javascript
- id, name, destination, startDate, endDate, description
- get formattedStartDate() → "1/1/2026"
- get dateRange() → "1/1/2026 - 1/5/2026"
- static fromJSON(json) → Trip
- static fromJSONArray(array) → Trip[]
```

### View (Presentation Layer)
**Location**: `public/js/views/`

Handles all DOM manipulation and UI updates. No business logic.

**AuthView.js**:
```javascript
- showError(message, elementId)
- hideError(elementId)
- clearForm(formId)
- disableForm(formId, disabled)
```

**DashboardView.js**:
```javascript
- setUserName(name)
- showLoading() / hideLoading()
- showError(message) / hideError()
- showEmptyState()
- renderTrips(trips)
- showModal() / hideModal()
- clearModalForm()
```

### Controller (Logic Layer)
**Location**: `public/js/controllers/`

Coordinates between Models, Views, and Services. Handles user interactions.

**AuthController.js**:
```javascript
- initLogin() → Sets up login form
- initRegister() → Sets up register form
- handleLogin(form) → Processes login
- handleRegister(form) → Processes registration
```

**DashboardController.js**:
```javascript
- init() → Initialize dashboard
- checkAuthentication() → Verify user session
- setupEventListeners() → Bind all event handlers
- loadTrips() → Fetch and display trips
- handleCreateTrip(event) → Create new trip
- handleDeleteTrip(tripId) → Delete trip
- handleLogout() → Log user out
```

### Service (API Layer)
**Location**: `public/js/services/`

Handles all HTTP communication with the backend API.

**ApiService.js** (Base class):
```javascript
- request(endpoint, options) → Promise
- get(endpoint) → Promise
- post(endpoint, data) → Promise
- put(endpoint, data) → Promise
- delete(endpoint) → Promise
```

**AuthService.js** (extends ApiService):
```javascript
- login(email, password) → Promise<User>
- register(userData) → Promise<User>
- logout() → Promise
- verifySession() → Promise<User>
- getCurrentUser() → Promise<User>
```

**TripService.js** (extends ApiService):
```javascript
- getAllTrips() → Promise<Trip[]>
- getTripById(id) → Promise<Trip>
- createTrip(tripData) → Promise<Trip>
- updateTrip(id, tripData) → Promise<Trip>
- deleteTrip(id) → Promise
```

## Features

### 1. Landing Page (`/index.html`)
- Hero section with call-to-action
- Feature showcase (flights, hotels, events, companions)
- Links to login/register

### 2. Authentication

#### Login (`/login.html`)
- Email and password fields
- Error message display
- Links to register and home

#### Register (`/register.html`)
- First name, last name, email, password fields
- Form validation
- Links to login and home

**API Endpoints Used**:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `GET /api/v1/auth/verify-session`

### 3. Dashboard (`/dashboard.html`)

#### Features:
- **Session verification** → Redirects to login if not authenticated
- **User name display** → Shows logged-in user's full name
- **Trip list** → Grid of trip cards
- **Create trip** → Modal form with validation
- **Delete trip** → With confirmation dialog
- **Logout** → Clears session

#### Trip Card Components:
- Trip name
- Destination with location icon
- Date range with calendar icon
- Description (optional)
- View Details button (placeholder)
- Delete button

#### Create Trip Modal:
- Trip name (required)
- Destination (required)
- Start date (required)
- End date (required)
- Description (optional)
- Client-side date validation (end date must be after start date)

**API Endpoints Used**:
- `GET /api/v1/trips` → List all trips
- `POST /api/v1/trips` → Create trip
- `DELETE /api/v1/trips/:id` → Delete trip
- `GET /api/v1/auth/logout` → Logout

## Design System

### Colors
```css
--primary-color: #5271ff       /* Main blue */
--primary-hover: #3d5ce8       /* Darker blue */
--secondary-color: #6c757d     /* Gray */
--success-color: #28a745       /* Green */
--danger-color: #dc3545        /* Red */
--light-bg: #f8f9fa            /* Light gray background */
```

### Components
- **Buttons**: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`
- **Forms**: `.form-group`, `.form-control`
- **Cards**: `.trip-card`, `.auth-card`, `.feature`
- **Modal**: `.modal`, `.modal-content`, `.modal-header`
- **Messages**: `.error-message`, `.success-message`

### Responsive Breakpoints
- Mobile: < 768px (single column layouts)
- Desktop: ≥ 768px (multi-column grids)

## API Integration

All API calls use:
- **Base URL**: `/api/v1`
- **Credentials**: `include` (sends cookies for session management)
- **Content-Type**: `application/json`

### Error Handling
Services throw errors on failed requests, which controllers catch and display via views.

### Session Management
- Uses Express sessions with cookies
- Session verified on dashboard load
- Automatic redirect to login if session expired

## Future Enhancements

### Planned Features (Not Yet Implemented):
1. **Trip Details Page** → View all items (flights, hotels, etc.) in a trip
2. **Item Management** → Add/edit/delete flights, hotels, events
3. **Companion Management** → Share trips with other users
4. **Profile Page** → Edit user information
5. **Search/Filter** → Filter trips by date, destination
6. **Sort Options** → Sort trips by various criteria
7. **Responsive Navigation** → Mobile menu

### Easy Extensions:
The MVCS architecture makes it easy to add new features:

1. **Add a new page**:
   - Create HTML file in `public/`
   - Create corresponding view, controller, and service (if needed)
   - Add route handling

2. **Add a new model**:
   - Create model class in `public/js/models/`
   - Add `fromJSON` static method
   - Define computed properties

3. **Add a new API endpoint**:
   - Create/extend service in `public/js/services/`
   - Add method that calls the endpoint
   - Use in controller

## Development Tips

### Debugging
```javascript
// Enable in browser console
localStorage.setItem('debug', 'true')

// View all trips
fetch('/api/v1/trips', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)

// Check session
fetch('/api/v1/auth/verify-session', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
```

### Testing Locally (without Docker)
1. Update `.env`: Set `DB_HOST=localhost`, `REDIS_HOST=localhost`
2. Ensure PostgreSQL and Redis are running locally
3. Run `npm run dev`
4. Access at `http://localhost:3002`

### Common Issues

**Login not working?**
- Check browser console for errors
- Verify API endpoint returns 200
- Check cookies are being set (`document.cookie`)

**Trips not loading?**
- Verify user is authenticated (session check)
- Check API response in Network tab
- Verify database has trip data

**Styles not loading?**
- Check `express.static('public')` in server.js
- Verify CSS file path is correct
- Clear browser cache

## Testing

### Manual Testing Checklist
- [ ] Landing page loads
- [ ] Registration creates new user
- [ ] Login with valid credentials
- [ ] Login with invalid credentials shows error
- [ ] Dashboard shows user name
- [ ] Dashboard loads trips
- [ ] Create trip modal opens
- [ ] Create trip with valid data
- [ ] Create trip validates dates
- [ ] Delete trip with confirmation
- [ ] Logout redirects to home
- [ ] Unauthenticated access redirects to login

### Browser Compatibility
Tested on:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License
MIT
