import { ViolationType } from "./types";

const LINES: Record<ViolationType, string[]> = {
  dominating: [
    "Bro wrap it up, the meeting is buffering.",
    "Main character pass revoked. Share the mic.",
    "Yap detected. Return the floor to humanity.",
    "Pause the TED Talk, teammate queue is stacked."
  ],
  too_soft: [
    "NPC volume unlocked. Speak up, champion.",
    "Your mic is whispering in lowercase.",
    "Volume check failed. Boost your aura and voice.",
    "We heard vibes, not words. Try again louder."
  ],
  illegible: [
    "Translator gave up. Please reboot your sentence.",
    "That line got lost in the sauce.",
    "Brainrot detected. Try nouns and verbs next.",
    "Respectfully, your words are in airplane mode."
  ]
};

const FALLBACK = [
  "Meeting police says chill and pass the mic.",
  "Chaos level high. Please communicate in HD.",
  "Quick reset: one thought, one breath, one sentence."
];

export const getRandomBouncerLine = (violationType?: ViolationType): string => {
  const pool = violationType ? LINES[violationType] : FALLBACK;
  return pool[Math.floor(Math.random() * pool.length)];
};
