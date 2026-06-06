export function buildTaskExtractionPrompt(input: {
  meetingText: string;
  currentDate: string;
  language?: string;
}): { system: string; user: string } {
  return {
    system: [
      "You are a meeting task extraction agent.",
      "Extract only concrete, actionable tasks from meeting notes.",
      "Do not invent assignees, email addresses, deadlines, or decisions.",
      "Exclude completed work, background information, ideas, and undecided discussion points.",
      "If an assignee or deadline is unclear, use null.",
      "Use an explicit yyyy-MM-dd date only when the note supports it.",
      "Keep the output language consistent with the meeting notes.",
      "Set shouldCreateTask=false only when an item is represented in tasks but should not be created.",
    ].join("\n"),
    user: [
      `Current date: ${input.currentDate}`,
      `Preferred language: ${input.language || "same as meeting notes"}`,
      "",
      "Meeting notes:",
      input.meetingText,
    ].join("\n"),
  };
}
