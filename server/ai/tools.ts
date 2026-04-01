import type { ChatCompletionTool } from 'openai/resources/chat/completions';

/** Student agent tools — misconception-focused behavioral annotations. */
export const STUDENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'express_confusion',
      description:
        'Express confusion or reveal a misconception about a topic. Use this when you are genuinely confused, have a wrong idea, or only partially understand something.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description:
              'The specific topic or concept the student is confused about',
          },
          misconception: {
            type: 'string',
            description:
              'The specific wrong belief or misunderstanding, if any',
          },
        },
        required: ['topic'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_question',
      description:
        'Ask the teacher a question. Use this to request clarification, challenge an explanation, or go off-topic.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The question being asked',
          },
          question_type: {
            type: 'string',
            enum: ['clarifying', 'challenging', 'off_topic'],
            description:
              'clarifying: seeking understanding. challenging: pushing back. off_topic: drifting from the lesson.',
          },
        },
        required: ['question', 'question_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_reasoning',
      description:
        'Share your step-by-step thinking process about a problem or concept. Use this when explaining how you arrived at an answer.',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: { type: 'string' },
            description: 'Each step of the reasoning process, in order',
          },
        },
        required: ['steps'],
      },
    },
  },
];

/** Observer tools — structured feedback for teaching practice analysis. */
export const OBSERVER_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'suggest_technique',
      description:
        'Recommend a specific teaching technique. Include the pedagogical rationale and a concrete example.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Name of the technique (e.g., "Revoicing", "Wait Time", "Probing Question")',
          },
          rationale: {
            type: 'string',
            description:
              'Why this technique is appropriate — connect to what happened in the conversation',
          },
          example: {
            type: 'string',
            description:
              'A concrete example of what the teacher could say or do',
          },
        },
        required: ['name', 'rationale', 'example'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'highlight_moment',
      description:
        'Highlight a specific moment in the conversation — a strength, missed opportunity, or concern.',
      parameters: {
        type: 'object',
        properties: {
          quote: {
            type: 'string',
            description: 'A brief quote or paraphrase from the transcript',
          },
          feedback_type: {
            type: 'string',
            enum: ['strength', 'missed_opportunity', 'concern'],
            description:
              'strength: done well. missed_opportunity: could have been more effective. concern: potentially counterproductive.',
          },
          suggestion: {
            type: 'string',
            description:
              'What to do differently or keep doing, with specific guidance',
          },
        },
        required: ['quote', 'feedback_type', 'suggestion'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'probe_decision',
      description:
        'Ask the teacher to reflect on a specific decision they made. Promotes metacognition about teaching practice.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description:
              'A reflective question about why the teacher made a particular choice',
          },
          related_moment: {
            type: 'string',
            description:
              'Brief description of the moment this question refers to',
          },
        },
        required: ['question', 'related_moment'],
      },
    },
  },
];
