import { DateTime } from "luxon";

export function timeFromNow(date: string) {
  return DateTime.fromSQL(date).toRelative();
}