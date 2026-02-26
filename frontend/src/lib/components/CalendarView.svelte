<script>
  import { onMount } from 'svelte';

  export let trips = [];
  export let standaloneItems = [];
  export let companionTrips = [];
  export let companionStandaloneItems = [];
  export let visibleItemTypes = {
    trip: true, flight: true, hotel: true,
    transportation: true, car_rental: true, event: true
  };

  let today = new Date();

  // Generate 15 months of calendar data (last 3 months + current + next 11 months)
  function generateCalendarMonths() {
    const months = [];
    const startDate = new Date(today.getFullYear(), today.getMonth() - 3, 1);

    for (let i = 0; i < 15; i++) {
      const monthDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      // Format month/year label
      const monthName = monthDate.toLocaleString('default', { month: 'short' });
      const yearLabel = `'${year.toString().slice(2)}`;

      months.push({
        year,
        month,
        monthName,
        yearLabel,
        daysInMonth,
        firstDay: new Date(year, month, 1),
        lastDay: new Date(year, month, daysInMonth, 23, 59, 59)
      });
    }

    return months;
  }

  // Parse YYYY-MM-DD as local time to avoid timezone off-by-one
  function parseDateOnly(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  // Process trips and items into calendar events
  function processCalendarEvents() {
    const events = [];

    // Process trips
    trips.forEach(trip => {
      if (trip.departureDate && visibleItemTypes.trip) {
        const startDate = parseDateOnly(trip.departureDate);
        const endDate = trip.returnDate ? parseDateOnly(trip.returnDate) : startDate;

        events.push({
          id: trip.id,
          type: 'trip',
          name: trip.name,
          startDate,
          endDate,
          colorClass: 'color-trip',
          tentative: trip.isConfirmed === false,
          data: trip
        });
      }

      // Process items nested within each trip
      const nestedItems = [
        ...(trip.flights || []).map(i => ({ ...i, itemType: 'flight' })),
        ...(trip.hotels || []).map(i => ({ ...i, itemType: 'hotel' })),
        ...(trip.transportation || []).map(i => ({ ...i, itemType: 'transportation' })),
        ...(trip.carRentals || []).map(i => ({ ...i, itemType: 'car_rental' })),
        ...(trip.events || []).map(i => ({ ...i, itemType: 'event' })),
      ];

      nestedItems.forEach(item => {
        if (!visibleItemTypes[item.itemType]) return;
        const startDate = getItemStartDate(item);
        const endDate = getItemEndDate(item) || startDate;
        if (!startDate) return;

        events.push({
          id: item.id,
          type: 'item',
          itemType: item.itemType,
          name: getItemLabel(item),
          startDate,
          endDate,
          colorClass: getItemColorClass(item.itemType),
          tentative: item.isConfirmed === false,
          data: item,
          tripId: trip.id
        });
      });
    });

    // Process standalone items
    standaloneItems.forEach(item => {
      if (!visibleItemTypes[item.itemType]) return;
      const startDate = getItemStartDate(item);
      const endDate = getItemEndDate(item) || startDate;

      if (startDate) {
        events.push({
          id: item.id,
          type: 'standalone',
          itemType: item.itemType,
          name: getItemLabel(item),
          startDate,
          endDate,
          colorClass: getItemColorClass(item.itemType),
          tentative: item.isConfirmed === false,
          data: item
        });
      }
    });

    // Process companion trips
    companionTrips.forEach(trip => {
      if (trip.departureDate && visibleItemTypes.trip) {
        const startDate = parseDateOnly(trip.departureDate);
        const endDate = trip.returnDate ? parseDateOnly(trip.returnDate) : startDate;
        events.push({
          id: `c-${trip.id}`,
          type: 'trip',
          name: trip.name,
          startDate,
          endDate,
          colorClass: 'color-trip',
          tentative: trip.isConfirmed === false,
          companion: true,
          data: trip
        });
      }

      const nestedItems = [
        ...(trip.flights || []).map(i => ({ ...i, itemType: 'flight' })),
        ...(trip.hotels || []).map(i => ({ ...i, itemType: 'hotel' })),
        ...(trip.transportation || []).map(i => ({ ...i, itemType: 'transportation' })),
        ...(trip.carRentals || []).map(i => ({ ...i, itemType: 'car_rental' })),
        ...(trip.events || []).map(i => ({ ...i, itemType: 'event' })),
      ];
      nestedItems.forEach(item => {
        if (!visibleItemTypes[item.itemType]) return;
        const startDate = getItemStartDate(item);
        const endDate = getItemEndDate(item) || startDate;
        if (!startDate) return;
        events.push({
          id: `c-${item.id}`,
          type: 'item',
          itemType: item.itemType,
          name: getItemLabel(item),
          startDate,
          endDate,
          colorClass: getItemColorClass(item.itemType),
          tentative: item.isConfirmed === false,
          companion: true,
          data: item,
          tripId: trip.id
        });
      });
    });

    // Process companion standalone items
    companionStandaloneItems.forEach(item => {
      if (!visibleItemTypes[item.itemType]) return;
      const startDate = getItemStartDate(item);
      const endDate = getItemEndDate(item) || startDate;
      if (startDate) {
        events.push({
          id: `c-${item.id}`,
          type: 'standalone',
          itemType: item.itemType,
          name: getItemLabel(item),
          startDate,
          endDate,
          colorClass: getItemColorClass(item.itemType),
          tentative: item.isConfirmed === false,
          companion: true,
          data: item
        });
      }
    });

    return events;
  }

  // Get item start date
  function getItemStartDate(item) {
    switch (item.itemType) {
      case 'flight':
        return item.departureDateTime ? new Date(item.departureDateTime) : null;
      case 'hotel':
        return item.checkInDateTime ? new Date(item.checkInDateTime) : null;
      case 'transportation':
        return item.departureDateTime ? new Date(item.departureDateTime) : null;
      case 'car_rental':
        return item.pickupDateTime ? new Date(item.pickupDateTime) : null;
      case 'event':
        return item.startDateTime ? new Date(item.startDateTime) : null;
      default:
        return null;
    }
  }

  // Get item end date
  function getItemEndDate(item) {
    switch (item.itemType) {
      case 'flight':
        return item.arrivalDateTime ? new Date(item.arrivalDateTime) : null;
      case 'hotel':
        return item.checkOutDateTime ? new Date(item.checkOutDateTime) : null;
      case 'transportation':
        return item.arrivalDateTime ? new Date(item.arrivalDateTime) : null;
      case 'car_rental':
        return item.dropoffDateTime ? new Date(item.dropoffDateTime) : null;
      case 'event':
        return item.endDateTime ? new Date(item.endDateTime) : null;
      default:
        return null;
    }
  }

  // Get item label
  function getItemLabel(item) {
    switch (item.itemType) {
      case 'flight':
        return `${item.origin || ''} → ${item.destination || ''}`.trim() || 'Flight';
      case 'hotel':
        return item.hotelName || 'Hotel';
      case 'transportation':
        return `${item.pickupLocation || ''} → ${item.dropoffLocation || ''}`.trim() || 'Transportation';
      case 'car_rental':
        return item.rentalCompany || 'Car Rental';
      case 'event':
        return item.name || 'Event';
      default:
        return item.itemType;
    }
  }

  // Get color class for item type
  function getItemColorClass(itemType) {
    const colorClasses = {
      flight: 'color-flight',
      hotel: 'color-hotel',
      transportation: 'color-transportation',
      car_rental: 'color-car-rental',
      event: 'color-event'
    };
    return colorClasses[itemType] || 'color-default';
  }

  // Calculate bars for a specific month
  function calculateBarsForMonth(monthData, events) {
    const monthStart = monthData.firstDay.getTime();
    const monthEnd = monthData.lastDay.getTime();

    // Filter events that overlap with this month
    const monthEvents = events.filter(event => {
      const eventStart = event.startDate.getTime();
      const eventEnd = event.endDate.getTime();
      return eventEnd >= monthStart && eventStart <= monthEnd;
    });

    // Calculate bar position and width for each event
    const bars = monthEvents.map(event => {
      const eventStart = event.startDate;
      const eventEnd = event.endDate;

      // Determine which day of the month the bar starts on (1-31)
      let startDay;
      if (eventStart.getTime() < monthStart) {
        startDay = 1; // Event started before this month
      } else {
        startDay = eventStart.getDate();
      }

      // Determine which day of the month the bar ends on (1-31)
      let endDay;
      if (eventEnd.getTime() > monthEnd) {
        endDay = monthData.daysInMonth; // Event extends beyond this month
      } else {
        endDay = eventEnd.getDate();
      }

      const width = endDay - startDay + 1; // Number of days the bar spans

      return {
        ...event,
        startDay,
        endDay,
        width,
        row: undefined // Will be set by collision detection
      };
    });

    // Define priority order: trip > hotel > others
    const getPriority = (bar) => {
      if (bar.type === 'trip') return 0;
      if (bar.itemType === 'hotel') return 1;
      return 2;
    };

    // Sort bars by priority, then start day, then by width (longer bars first)
    bars.sort((a, b) => {
      // First, sort by priority
      const priorityDiff = getPriority(a) - getPriority(b);
      if (priorityDiff !== 0) return priorityDiff;

      // Then by start day
      if (a.startDay !== b.startDay) return a.startDay - b.startDay;

      // Finally by width (longer bars first)
      return b.width - a.width;
    });

    // Assign rows to avoid overlapping bars
    // Process in sorted order so higher priority items get lower row numbers
    bars.forEach(bar => {
      // Find the first row where this bar doesn't overlap with already-placed bars
      let row = 0;
      while (true) {
        const overlapping = bars.some(otherBar => {
          // Skip if it's the same bar or the other bar hasn't been assigned a row yet
          if (otherBar === bar || otherBar.row === undefined) {
            return false;
          }
          // Check if on the same row and overlapping date range
          return otherBar.row === row &&
                 !(bar.endDay < otherBar.startDay || bar.startDay > otherBar.endDay);
        });
        if (!overlapping) {
          bar.row = row;
          break;
        }
        row++;
      }
    });

    return bars;
  }

  // Check if a day is today
  function isToday(monthData, day) {
    return monthData.year === today.getFullYear() &&
           monthData.month === today.getMonth() &&
           day === today.getDate();
  }

  $: calendarMonths = generateCalendarMonths();
  $: calendarEvents = (trips, standaloneItems, companionTrips, companionStandaloneItems, visibleItemTypes, processCalendarEvents());
  $: monthBars = calendarMonths.map(month => calculateBarsForMonth(month, calendarEvents));

  onMount(() => {
    const interval = setInterval(() => {
      today = new Date();
    }, 60000);

    return () => clearInterval(interval);
  });
</script>

<div class="calendar-view">
  <div class="calendar-scroll">
    <div class="calendar-table">
      <!-- Month rows -->
      {#each calendarMonths as monthData, monthIndex}
        {@const bars = monthBars[monthIndex]}
        {@const maxRow = bars.length > 0 ? Math.max(...bars.map(b => b.row)) : -1}
        {@const rowCount = maxRow + 1}

        <div class="month-row" style="--row-count: {Math.max(rowCount, 1)};">
          <!-- Month label column -->
          <div class="month-label">
            <div class="month-name">{monthData.monthName}</div>
            <div class="month-year">{monthData.yearLabel}</div>
          </div>

          <!-- Day cells container (holds both cells and bars) -->
          <div class="days-container">
            <!-- Day cells grid -->
            <div class="day-cells">
              {#each Array(31) as _, dayIndex}
                {@const day = dayIndex + 1}
                {@const isTodayCell = isToday(monthData, day)}
                {@const isInMonth = day <= monthData.daysInMonth}
                {@const dayOfWeek = isInMonth ? new Date(monthData.year, monthData.month, day).getDay() : -1}
                {@const isWeekend = dayOfWeek === 0 || dayOfWeek === 6}
                <div
                  class="day-cell"
                  class:today={isTodayCell}
                  class:empty={!isInMonth}
                  class:weekend={isWeekend && isInMonth}
                >
                  {#if isInMonth}
                    <span class="day-number">{day}</span>
                  {/if}
                </div>
              {/each}
            </div>

            <!-- Bars layer -->
            <div class="bars-container">
              {#each bars as bar}
                <div
                  class="event-bar {bar.colorClass}"
                  class:tentative={bar.tentative}
                  class:companion={bar.companion}
                  style="
                    left: {((bar.startDay - 1) / 31) * 100}%;
                    width: calc({(bar.width / 31) * 100}% - 1px);
                    top: {bar.row * 20 + 16}px;
                  "
                  title={bar.name}
                >
                  <span class="event-bar-text">{bar.name}</span>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .calendar-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  @media (max-width: 640px) {
    .calendar-view {
      margin-left: calc(-1 * var(--spacing-md));
      margin-right: calc(-1 * var(--spacing-md));
    }
  }

  .calendar-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--spacing-lg) 0;
  }

  .calendar-table {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .month-row {
    display: grid;
    grid-template-columns: 38px 1fr;
    gap: 0;
    min-height: calc(var(--row-count) * 20px + 18px);
    background: transparent;
  }

  .month-label {
    background: transparent;
    padding: 4px 2px;
    text-align: center;
    border-right: 1px solid var(--glass-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 2px;
  }

  .month-name {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--dark-text);
    line-height: 1;
  }

  .month-year {
    font-size: 0.6rem;
    font-weight: 500;
    color: var(--gray-dark);
    line-height: 1;
  }

  .days-container {
    position: relative;
    display: grid;
    grid-template-columns: repeat(31, 1fr);
  }

  .day-cells {
    display: grid;
    grid-template-columns: repeat(31, 1fr);
    grid-column: 1 / -1;
  }

  .day-cell {
    box-sizing: border-box;
    background: transparent;
    border-right: 1px solid var(--glass-border);
    min-height: 100%;
    position: relative;
    padding: 2px;
  }

  .day-cell.weekend {
    background: var(--glass-bg-light);
  }

  .day-cell.empty {
    background: transparent;
    opacity: 0.3;
  }

  .day-cell.today {
    background: rgba(220, 38, 38, 0.1);
    border-right: 2px solid red;
  }

  .day-number {
    position: absolute;
    top: 1px;
    left: 2px;
    font-size: 0.65rem;
    letter-spacing: -0.1em;
    font-weight: 500;
    color: var(--gray-dark);
    line-height: 1;
    pointer-events: none;
  }

  .day-cell.today .day-number {
    color: red;
    font-weight: 600;
  }

  .bars-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    grid-column: 1 / -1;
  }

  .event-bar {
    position: absolute;
    height: 16px;
    border-radius: 2px;
    display: flex;
    align-items: center;
    padding: 0 4px;
    font-size: 0.6rem;
    font-weight: 500;
    color: white;
    white-space: nowrap;
    overflow: hidden;
  }

  .event-bar-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .event-bar.companion {
    opacity: 0.6;
    border: 1px dashed rgba(255, 255, 255, 0.6);
  }

  /* Scrollbar styling */
  .calendar-scroll::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .calendar-scroll::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
  }

  .calendar-scroll::-webkit-scrollbar-thumb {
    background: var(--glass-border);
    border-radius: 4px;
  }

  .calendar-scroll::-webkit-scrollbar-thumb:hover {
    background: var(--gray-dark);
  }

  /* Event bar color classes — rgba for softness */
  .event-bar.color-trip {
    background-color: rgba(96, 165, 250, 0.7);
  }

  .event-bar.color-flight {
    background-color: rgba(52, 211, 153, 0.7);
  }

  .event-bar.color-hotel {
    background-color: rgba(251, 191, 36, 0.7);
  }

  .event-bar.color-transportation {
    background-color: rgba(167, 139, 250, 0.7);
  }

  .event-bar.color-car-rental {
    background-color: rgba(244, 114, 134, 0.7);
  }

  .event-bar.color-event {
    background-color: rgba(96, 165, 250, 0.7);
  }

  .event-bar.color-default {
    background-color: rgba(156, 163, 175, 0.7);
  }

  .event-bar.tentative {
    background-image: repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 4px,
      rgba(255, 255, 255, 0.45) 4px,
      rgba(255, 255, 255, 0.45) 7px
    );
  }
</style>
