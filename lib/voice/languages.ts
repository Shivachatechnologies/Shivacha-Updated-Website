/** Supported conversation languages. Hinglish is recognised as Indian English (Latin script) and answered in Hinglish. */
export const VOICE_LANGUAGES = {
  "en-IN": { label: "English", recognition: "en-IN", speech: "en-IN", hint: "Reply in clear Indian English." },
  "hi-IN": { label: "हिन्दी (Hindi)", recognition: "hi-IN", speech: "hi-IN", hint: "Reply in Hindi (Devanagari script). Keep names, numbers and product terms as they are." },
  hinglish: { label: "Hinglish", recognition: "en-IN", speech: "en-IN", hint: "Reply in Hinglish: conversational Hindi written in Latin script, mixed with English business terms, the way people in India speak at work." },
} as const;
export type VoiceLanguage = keyof typeof VOICE_LANGUAGES;
export const isVoiceLanguage = (v: unknown): v is VoiceLanguage => typeof v === "string" && v in VOICE_LANGUAGES;

/** Turns an agent's markdown answer into something natural to say aloud (pure, unit-tested). */
export function toSpeech(markdown: string, max = 700): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " (details are on screen) ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*\|.*\|\s*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>~]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return `${end > max * 0.5 ? cut.slice(0, end + 1) : cut}… The full answer is on screen.`;
}

export function voiceChannelHint(lang: VoiceLanguage) {
  return [
    "CHANNEL: VOICE CONVERSATION. The user is talking to you and will hear your reply through text-to-speech.",
    "Answer in 1–4 short spoken sentences first; no tables, no markdown headings, no URLs. If detail is needed, give the headline and say the details are on screen.",
    "Never claim you completed an action that needs approval; say it is waiting for approval.",
    VOICE_LANGUAGES[lang].hint,
  ].join("\n");
}

/** Spoken requests to hand work off as a background task ("…in the background", "baad mein kar dena"). */
export const wantsBackground = (text: string) => /\b(in the background|background (task|mein)|do it later|baad mein|queue (it|this)|as a task)\b/i.test(text);
