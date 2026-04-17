export const PROBLEM_SIGNALS: string[] = [
  // Wishing / Wanting
  "i wish", "wish there was", "wish i could", "i just wish",
  "if only", "i want", "i need", "i really need",
  "would love to", "would be nice", "would be great if",
  "hoping for", "dreaming of", "imagine if",
  "why isn't there", "why don't they", "why can't i",
  "someone should make", "there should be",

  // Asking for Help
  "need help", "help me", "can anyone help", "please help",
  "any advice", "any suggestions", "any recommendations",
  "how do i", "how do you", "how can i",
  "is there a way", "is there anything", "is there a tool",
  "where do i start", "what should i do", "what do i do",
  "anyone know", "does anyone know", "does anyone have",
  "can someone explain", "can someone help", "can anyone recommend",
  "looking for help", "seeking advice", "need guidance",
  "lost", "confused", "no idea where to start",

  // Expressing Frustration
  "frustrated", "frustrating", "so frustrating",
  "annoying", "so annoying", "really annoying",
  "hate when", "hate that", "hate how", "i hate this",
  "tired of", "sick of", "fed up", "fed up with",
  "can't stand", "can't take it", "can't deal",
  "drives me crazy", "drives me insane", "drives me nuts",
  "this is ridiculous", "this is absurd", "this is insane",
  "unbelievable", "unacceptable", "ridiculous",
  "rant", "venting", "just venting", "needed to vent",
  "so done with", "done with this", "over it",

  // Describing a Problem
  "problem", "issue", "challenge", "obstacle", "barrier",
  "struggle", "struggling", "keep struggling",
  "difficult", "difficulty", "too difficult", "really difficult",
  "hard to", "so hard", "why is it so hard",
  "impossible", "nearly impossible", "feels impossible",
  "complicated", "complex", "overwhelming",
  "broken", "not working", "keeps breaking", "stopped working",
  "failing", "keep failing", "failed again",
  "stuck", "can't move forward", "blocked",
  "no solution", "no fix", "nothing works", "tried everything",
  "keeps happening", "happens every time", "always happens",
  "getting worse", "never gets better", "still not fixed",

  // Expressing Lack / Gap
  "can't find", "couldn't find", "nowhere to find",
  "can't afford", "too expensive", "costs too much",
  "not available", "doesn't exist", "no option",
  "missing", "lacking", "no access to",
  "limited", "restricted", "blocked from",
  "no one talks about", "no resources for", "nothing out there",
  "gap in", "hole in", "missing piece",

  // Regret / Reflection
  "regret", "wish i knew", "wish i had known",
  "made a mistake", "bad decision", "wrong choice",
  "wasted", "waste of time", "waste of money",
  "should have", "could have", "would have",
  "learned the hard way", "lesson learned",

  // Desperation / Urgency
  "desperate", "urgently need", "really need this",
  "running out of time", "deadline", "last resort",
  "please", "begging", "seriously need",
  "critical", "urgent", "emergency",
  "can't wait anymore", "need this now",

  // Solidarity / Shared Pain
  "anyone else", "does anyone else", "am i the only one",
  "we all know", "we've all been there",
  "common problem", "same issue", "same struggle",
  "happens to everyone", "not just me",
  "finally someone said it", "glad someone mentioned",
];

// Built once at startup
export const signalSet = new Set(PROBLEM_SIGNALS);