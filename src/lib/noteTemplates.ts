export type NoteTemplateId = "meeting" | "daily" | "weekly" | "decision" | "project";

export interface NoteTemplate {
  id: NoteTemplateId;
  name: string;
  content: string;
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function noteTemplates(): NoteTemplate[] {
  const today = todayLabel();
  return [
    {
      id: "meeting",
      name: "Meeting",
      content: `# Meeting

${today}

**Who**

**Why**

## Notes

## Actions
- [ ] 
`,
    },
    {
      id: "daily",
      name: "Daily",
      content: `# ${today}

## Today
- [ ] 

## Notes

`,
    },
    {
      id: "weekly",
      name: "Weekly review",
      content: `# Weekly review

${today}

## This week

## Next week
- [ ] 

## Waiting
- [ ] 
`,
    },
    {
      id: "decision",
      name: "Decision",
      content: `# Decision

${today}

**Choice**

**Why**

## Options

| Option | Upside | Downside |
| --- | --- | --- |
|  |  |  |
|  |  |  |

## Follow-up
- [ ] 
`,
    },
    {
      id: "project",
      name: "Project brief",
      content: `# Project brief

**Outcome**

**Done when**

## Now
- [ ] 

## Later
- [ ] 

## Notes

`,
    },
  ];
}

export function noteTemplate(id: NoteTemplateId): NoteTemplate {
  const template = noteTemplates().find((item) => item.id === id);
  if (!template) {
    throw new Error(`Unknown note template: ${id}`);
  }
  return template;
}
