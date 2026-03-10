export const formatRecentActivityDate = (dateStr) => {
  if (!dateStr) return "-";

  const date = new Date(dateStr);
  return `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date
    .getDate()
    .toString()
    .padStart(2, "0")} ${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
};

export const formatRecentActivitySize = (size) => {
  if (!size) return "-";

  const num = parseInt(size);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / 1024 / 1024).toFixed(1)} MB`;
};
