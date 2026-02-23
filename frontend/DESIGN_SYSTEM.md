# Design System

This document describes the design system for the Bluebonnet Travel Planner frontend. All design tokens are defined as CSS custom properties in `src/app.css` and should be used consistently across all components.

## Usage

All design tokens are available globally via CSS custom properties (CSS variables). Use them in your styles like this:

```css
.my-component {
  padding: var(--spacing-lg);
  border-radius: var(--radius-md);
  background: var(--white);
  box-shadow: var(--shadow-md);
}
```

## Color System

The design system uses a comprehensive color palette with 8 colors, each with 10 variants (50-900). Currently, the frontend uses 3 variants per color:
- **Light** (100) - Backgrounds, subtle highlights
- **Default** (500) - Primary usage
- **Dark** (800) - Text, emphasis

### Full Color Palette

#### Grey
- `--grey-50` through `--grey-900` - Complete neutral scale
- Currently used: 100 (light), 500 (default), 800 (dark)

#### Red
- `--red-50` through `--red-900` - Error, danger, destructive actions
- Currently used: 100 (light), 500 (default), 800 (dark)

#### Yellow
- `--yellow-50` through `--yellow-900` - Warnings, highlights
- Currently used: 100 (light), 500 (default), 800 (dark)

#### Green
- `--green-50` through `--green-900` - Success, positive actions
- Currently used: 100 (light), 500 (default), 800 (dark)

#### Blue
- `--blue-50` through `--blue-900` - Information, links
- All variants available for future use

#### Indigo
- `--indigo-50` through `--indigo-900` - Primary brand color
- Currently used: 100 (light), 500 (default), 600 (hover), 800 (dark)

#### Purple
- `--purple-50` through `--purple-900` - Special features, premium
- All variants available for future use

#### Pink
- `--pink-50` through `--pink-900` - Accents, highlights
- All variants available for future use

### Semantic Color Mapping

The application uses semantic color names that map to the palette:

#### Primary (Indigo)
- `--primary-light`: var(--indigo-100)
- `--primary-color`: var(--indigo-500)
- `--primary-hover`: var(--indigo-600)
- `--primary-dark`: var(--indigo-800)

#### Secondary (Grey)
- `--secondary-light`: var(--grey-100)
- `--secondary-color`: var(--grey-500)
- `--secondary-hover`: var(--grey-600)
- `--secondary-dark`: var(--grey-800)

#### Success (Green)
- `--success-light`: var(--green-100)
- `--success-color`: var(--green-500)
- `--success-dark`: var(--green-800)

#### Danger (Red)
- `--danger-light`: var(--red-100)
- `--danger-color`: var(--red-500)
- `--danger-hover`: var(--red-600)
- `--danger-dark`: var(--red-800)

#### Warning (Yellow)
- `--warning-light`: var(--yellow-100)
- `--warning-color`: var(--yellow-500)
- `--warning-dark`: var(--yellow-800)

#### Neutrals
- `--white`: #ffffff
- `--light-bg`: var(--grey-50)
- `--dark-text`: var(--grey-900)
- `--gray-text`: var(--grey-500)
- `--gray-light`: var(--grey-400)
- `--gray-dark`: var(--grey-700)
- `--border-color`: var(--grey-200)

## Spacing System

Consistent spacing scale based on rem units:

- `--spacing-xs`: 0.25rem (4px)
- `--spacing-sm`: 0.5rem (8px)
- `--spacing-md`: 0.75rem (12px)
- `--spacing-lg`: 1rem (16px)
- `--spacing-xl`: 1.25rem (20px)
- `--spacing-2xl`: 1.5rem (24px)
- `--spacing-3xl`: 2rem (32px)
- `--spacing-4xl`: 3rem (48px)
- `--spacing-5xl`: 4rem (64px)

### Usage Examples
```css
/* Padding */
padding: var(--spacing-lg);                    /* 16px all sides */
padding: var(--spacing-md) var(--spacing-xl);  /* 12px top/bottom, 20px left/right */

/* Margins */
margin-bottom: var(--spacing-3xl);             /* 32px */

/* Gaps */
gap: var(--spacing-sm);                        /* 8px */
```

## Border Radius

- `--radius-sm`: 4px - Small radius (buttons, inputs)
- `--radius-md`: 6px - Medium radius (cards, navigation)
- `--radius-lg`: 8px - Large radius (modals, panels)
- `--radius-xl`: 10px - Extra large radius (content panes)
- `--radius-2xl`: 12px - Hero sections, major containers
- `--radius-round`: 50% - Fully round (avatars, badges)

## Shadows

Progressive shadow scale for depth hierarchy:

- `--shadow-sm`: 0 1px 2px rgba(0, 0, 0, 0.05) - Subtle elevation
- `--shadow-md`: 0 2px 4px rgba(0, 0, 0, 0.1) - Standard elevation
- `--shadow-lg`: 0 4px 12px rgba(0, 0, 0, 0.15) - Elevated cards
- `--shadow-xl`: 0 4px 24px rgba(0, 0, 0, 0.15) - Floating panels
- `--shadow-2xl`: 0 6px 20px rgba(0, 0, 0, 0.22) - Highest elevation
- `--shadow-top`: 0 -2px 16px rgba(0, 0, 0, 0.1) - Top shadow (mobile nav)

## Glass Morphism / Backdrop

For glass/frosted UI effects (Dashboard navigation, panels):

### Backgrounds
- `--glass-bg-light`: rgba(255, 255, 255, 0.65) - Light glass
- `--glass-bg-medium`: rgba(255, 255, 255, 0.8) - Medium opacity
- `--glass-bg-heavy`: rgba(255, 255, 255, 0.95) - Heavy opacity

### Borders
- `--glass-border`: rgba(255, 255, 255, 0.3) - Light glass border
- `--glass-border-dark`: rgba(0, 0, 0, 0.1) - Dark glass border

### Blur
- `--blur-sm`: blur(4px)
- `--blur-md`: blur(8px)
- `--blur-lg`: blur(12px)

### Glass Effect Example
```css
.glass-panel {
  background: var(--glass-bg-light);
  backdrop-filter: var(--blur-lg);
  -webkit-backdrop-filter: var(--blur-lg);
  border: 1px solid var(--glass-border);
}
```

## Opacity

- `--opacity-disabled`: 0.6 - Disabled state
- `--opacity-hover`: 0.95 - Subtle hover effects
- `--opacity-muted`: 0.7 - Muted elements
- `--opacity-subtle`: 0.45 - Very subtle elements

## Transitions

- `--transition-fast`: 0.15s - Quick interactions (hover, active)
- `--transition-base`: 0.2s - Standard transitions
- `--transition-slow`: 0.3s - Slower, more deliberate animations

### Usage
```css
.button {
  transition: background var(--transition-base);
}

.icon {
  transition: transform var(--transition-fast), color var(--transition-fast);
}
```

## Z-Index Scale

Consistent stacking order:

- `--z-base`: 0 - Base layer
- `--z-dropdown`: 100 - Dropdown menus
- `--z-sticky`: 500 - Sticky headers
- `--z-fixed`: 999 - Fixed positioned elements
- `--z-modal-backdrop`: 1000 - Modal backdrop
- `--z-modal`: 1001 - Modal content
- `--z-popover`: 1002 - Popovers
- `--z-tooltip`: 1003 - Tooltips (highest)

## Component Patterns

### Cards
```css
.card {
  background: var(--white);
  border-radius: var(--radius-lg);
  padding: var(--spacing-3xl);
  box-shadow: var(--shadow-md);
}
```

### Buttons
```css
.btn {
  padding: var(--spacing-md) var(--spacing-2xl);
  border-radius: var(--radius-sm);
  transition: background var(--transition-base);
}
```

### Forms
```css
.input {
  padding: var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  transition: border-color var(--transition-base);
}
```

### Modals
```css
.modal {
  z-index: var(--z-modal);
  background: var(--white);
  border-radius: var(--radius-lg);
  padding: var(--spacing-3xl);
  box-shadow: var(--shadow-xl);
}
```

## Best Practices

### DO ✓
- Always use design tokens instead of hardcoded values
- Use the spacing scale for consistency (don't use arbitrary values like `15px`)
- Follow the z-index scale for proper layering
- Use appropriate shadow levels for visual hierarchy
- Apply consistent border radius based on component type

### DON'T ✗
- Don't hardcode colors, shadows, or spacing values
- Don't create new spacing values outside the scale
- Don't use arbitrary z-index values
- Don't mix different shadow styles on similar components
- Don't override design tokens with inline styles

## Customization

To customize the design system, edit the `:root` section in `src/app.css`. All changes will automatically propagate throughout the application.

### Example: Changing Primary Color
```css
:root {
  --primary-color: #3b82f6; /* New blue */
  --primary-hover: #2563eb; /* Darker shade */
  --primary-light: rgba(59, 130, 246, 0.1); /* Light tint */
}
```

### Example: Adjusting Spacing Scale
```css
:root {
  --spacing-lg: 1.25rem; /* Increase from 1rem to 1.25rem */
}
```

## Responsive Design

Design tokens work seamlessly with responsive breakpoints. The tokens remain consistent, but you can override specific values at different breakpoints if needed:

```css
.component {
  padding: var(--spacing-lg);
}

@media (max-width: 640px) {
  .component {
    padding: var(--spacing-md); /* Smaller on mobile */
  }
}
```

## Browser Support

CSS custom properties are supported in all modern browsers. For legacy browser support, consider using PostCSS with the `postcss-custom-properties` plugin.

## Files

- **Design System Definition**: `src/app.css` (lines 8-121)
- **Global Styles**: `src/app.css` (lines 123+)
- **Component Styles**: `src/routes/Dashboard.svelte` (uses design tokens)
