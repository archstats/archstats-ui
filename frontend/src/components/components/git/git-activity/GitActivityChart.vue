<template>
  <div class="p-4 bg-gray-50 border border-gray-200 rounded-lg inline-block">
    <h2 class="text-base font-semibold mb-3 text-gray-700">Commit Activity</h2>
    <div class="chart-layout">
      <div class="year-labels">
        <div v-for="label in yearLabels" :key="label.name" class="text-xs text-gray-500" :style="label.style">
          {{ label.name }}
        </div>
      </div>

      <div class="month-labels">
        <div v-for="label in monthLabels" :key="label.name" class="text-xs text-gray-500" :style="label.style">
          {{ label.name }}
        </div>
      </div>

      <div class="day-labels">
        <span class="text-xs text-gray-500">Mon</span>
        <span class="text-xs text-gray-500">Wed</span>
        <span class="text-xs text-gray-500">Fri</span>
      </div>

      <div class="activity-chart">
        <div
            v-for="(day, index) in daysInChart"
            :key="index"
            class="day-cell group relative"
            :class="day.colorClass"
        >
          <div class="w-full h-full rounded-sm"></div>
          <div
              v-if="day.date"
              class="absolute bottom-full mb-2 w-max px-2 py-1 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          >
            {{ day.commits.length }} commits on {{ formatDate(day.date) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

// Define a type for GitCommit for clarity
interface GitCommit {
  commit_time: string;
  [key: string]: any; // Allow other properties
}

// Define the component's props
const props = defineProps<{
  /**
   * The start date for the activity chart.
   * If not provided, it defaults to 365 days before the end date.
   */
  startDate?: Date;
  /**
   * The end date for the activity chart.
   */
  endDate: Date;
  /**
   * An array of commit objects to display.
   */
  commits: GitCommit[]
}>();

/**
 * A computed property that determines the start date for the chart.
 * Defaults to 365 days before the end date if `startDate` prop is not provided.
 */
const computedStartDate = computed(() => {
  if (props.startDate) {
    return new Date(props.startDate);
  }
  const end = new Date(props.endDate);
  const start = new Date(end);
  start.setDate(start.getDate() - 365);
  return start;
});

/**
 * Represents a single day cell in the chart.
 * `date` is null for placeholder cells used for alignment.
 */
interface DayCell {
  date: Date | null;
  commits: GitCommit[];
  colorClass: string;
}

/**
 * A computed property that groups commits into a Map by day.
 * The key is a 'YYYY-MM-DD' string, and the value is an ordered array of commits.
 */
const commitsByDay = computed(() => {
  const commitsMap = new Map<string, GitCommit[]>();
  if (!props.commits) {
    return commitsMap;
  }

  // Group commits by day
  for (const commit of props.commits) {
    const commitDate = new Date(commit.commit_time);
    const dateKey = commitDate.toISOString().slice(0, 10); // YYYY-MM-DD format

    if (!commitsMap.has(dateKey)) {
      commitsMap.set(dateKey, []);
    }
    commitsMap.get(dateKey)!.push(commit);
  }

  // Sort commits within each day by commit_time
  commitsMap.forEach((commits) => {
    commits.sort((a, b) => new Date(a.commit_time).getTime() - new Date(b.commit_time).getTime());
  });

  return commitsMap;
});

/**
 * A computed property that finds the maximum number of commits in a single day.
 * This is used to set the upper bound of our color scale.
 */
const maxCommitsInDay = computed(() => {
  let max = 0;
  commitsByDay.value.forEach(commits => {
    if (commits.length > max) {
      max = commits.length;
    }
  });
  return max > 0 ? max : 1; // Avoid division by zero
});

/**
 * A computed property that generates the array of day cells to be rendered.
 * It generates cells for each day between the start and end dates and adds
 * placeholder cells at the beginning to align the first day with the correct
 * day of the week in the grid.
 */
const daysInChart = computed<DayCell[]>(() => {
  // Use the new computed property for the start date
  const start = new Date(computedStartDate.value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(props.endDate);
  end.setHours(23, 59, 59, 999);

  const dayCells: DayCell[] = [];
  const currentDate = new Date(start);

  // 1. Generate day cells for the specified date range.
  while (currentDate <= end) {
    const date = new Date(currentDate);
    const dateKey = date.toISOString().slice(0, 10); // YYYY-MM-DD
    const commitsForDay = commitsByDay.value.get(dateKey) || [];

    const colorClass = commitsForDay.length > 0
        ? numberToTailwindScaledColor(commitsForDay.length, tailwindCellColors, 1, maxCommitsInDay.value)
        : 'bg-gray-200';

    dayCells.push({
      date,
      commits: commitsForDay,
      colorClass,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // 2. Add placeholder cells at the beginning to align the start date.
  // We align to Sunday (getDay() === 0) as the first column.
  if (dayCells.length > 0 && dayCells[0].date) {
    const firstDayOfWeek = dayCells[0].date.getDay();
    for (let i = 0; i < firstDayOfWeek; i++) {
      dayCells.unshift({ date: null, commits: [], colorClass: 'bg-transparent' });
    }
  }

  return dayCells;
});

/**
 * Generates labels for years, positioned based on where the year starts in the chart.
 */
const yearLabels = computed(() => {
  const labels: { name: string; style: { position: string; left: string }; position: number }[] = [];
  let lastYear = -1;

  daysInChart.value.forEach((day, index) => {
    if (!day.date) return;

    const currentYear = day.date.getFullYear();
    if (currentYear !== lastYear) {
      const weekIndex = Math.floor(index / 7);
      const newPosition = weekIndex * 16; // 12px cell width + 4px gap

      labels.push({
        name: currentYear.toString(),
        style: {
          position: 'absolute',
          left: `${newPosition}px`,
        },
        position: newPosition,
      });
      lastYear = currentYear;
    }
  });

  return labels.map(({ name, style }) => ({ name, style }));
});


/**
 * Generates labels for months, positioned based on the week they start in.
 * Prevents labels from overlapping and aligns them to the first day of each month.
 */
const monthLabels = computed(() => {
  const labels: { name: string; style: { position: string; left: string }; position: number }[] = [];
  let lastMonthIdentifier = ''; // Use 'YYYY-MM' to track month changes across years
  const minSpacing = 30; // Minimum pixels between the start of labels

  daysInChart.value.forEach((day, index) => {
    if (!day.date) return;

    const monthIdentifier = `${day.date.getFullYear()}-${day.date.getMonth()}`;

    // Place a label when a new month starts. This aligns the label with the column
    // where the first day of the month appears.
    if (monthIdentifier !== lastMonthIdentifier) {
      const weekIndex = Math.floor(index / 7);
      const newPosition = weekIndex * 16; // 12px cell width + 4px gap

      const lastLabel = labels[labels.length - 1];

      // Add the new label only if there's enough space from the previous one.
      if (!lastLabel || (newPosition - lastLabel.position) >= minSpacing) {
        labels.push({
          name: day.date.toLocaleString('en-US', { month: 'short' }),
          style: {
            position: 'absolute',
            left: `${newPosition}px`
          },
          position: newPosition
        });
        lastMonthIdentifier = monthIdentifier;
      }
    }
  });
  return labels.map(({ name, style }) => ({ name, style }));
});


/**
 * Formats a Date object into a readable string for the tooltip.
 * @param date - The date to format.
 */
const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};


const tailwindCellColors = [
  "bg-archstats-100",
  "bg-archstats-200",
  "bg-archstats-300",
  "bg-archstats-400",
  "bg-archstats-500",
  "bg-archstats-600",
  "bg-archstats-700",
  "bg-archstats-800",
  "bg-archstats-900",
];

// Given a number and a scale, return the corresponding tailwind class
function numberToTailwindScaledColor(num: number, classes: string[], scaleMin: number, scaleMax: number) {
  if (num < scaleMin) {
    return classes[0]
  }
  if (num >= scaleMax) {
    return classes[classes.length - 1]
  }
  const range = scaleMax - scaleMin;
  const step = range > 0 ? range / (classes.length -1) : 1;
  const index = Math.floor((num - scaleMin) / step);
  return classes[index];
}

</script>

<style scoped>
.chart-layout {
  display: grid;
  grid-template-areas:
    ". years"
    ". months"
    "days chart";
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto 1fr;
  gap: 8px;
}

.year-labels {
  grid-area: years;
  position: relative;
  height: 1.2rem;
}

.month-labels {
  grid-area: months;
  position: relative;
  height: 1.2rem;
}

.day-labels {
  grid-area: days;
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 4px; /* Match chart gap */
}
.day-labels span:nth-child(1) { grid-row: 2; } /* Mon */
.day-labels span:nth-child(2) { grid-row: 4; } /* Wed */
.day-labels span:nth-child(3) { grid-row: 6; } /* Fri */


.activity-chart {
  grid-area: chart;
  display: grid;
  grid-template-rows: repeat(7, 12px);
  grid-auto-flow: column;
  gap: 4px;
}

.day-cell {
  width: 12px;
  height: 12px;
}

/* Position the tooltip above the cell */
.group .absolute {
  transform: translateX(-50%);
  left: 50%;
  z-index: 10;
}
</style>