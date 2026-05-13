import { describe, expect, it } from "vitest";
import { ViolationDetector, hasGibberishPattern } from "../client/src/lib/violationDetector";

describe("violation detector", () => {
  it("triggers dominating after 10s speaking", () => {
    const detector = new ViolationDetector();
    let sawDominating = false;
    for (let i = 0; i <= 60; i += 1) {
      const violation = detector.evaluate({
        now: i * 200,
        activeSpeakerId: "a",
        isSpeakerClaiming: true,
        rms: 0.12,
        transcriptText: "clear words with meaning now"
      });
      if (violation?.type === "dominating") {
        sawDominating = true;
      }
    }
    expect(sawDominating).toBe(true);
  });

  it("triggers too_soft for low rms and sparse transcript", () => {
    const detector = new ViolationDetector();
    let sawTooSoft = false;
    for (let i = 0; i <= 30; i += 1) {
      const violation = detector.evaluate({
        now: i * 200,
        activeSpeakerId: "a",
        isSpeakerClaiming: true,
        rms: 0.01,
        transcriptText: ""
      });
      if (violation?.type === "too_soft") {
        sawTooSoft = true;
      }
    }
    expect(sawTooSoft).toBe(true);
  });

  it("detects gibberish patterns", () => {
    expect(hasGibberishPattern("blah blah blah blah blah")).toBe(true);
    expect(hasGibberishPattern("asdf qwer asdf qwer")).toBe(true);
    expect(hasGibberishPattern("we need to share timeline updates")).toBe(false);
  });

  it("respects cooldowns", () => {
    const detector = new ViolationDetector();
    let first: ReturnType<typeof detector.evaluate> = null;
    for (let i = 0; i < 60; i += 1) {
      const candidate = detector.evaluate({
        now: i * 200,
        activeSpeakerId: "a",
        isSpeakerClaiming: true,
        rms: 0.12,
        transcriptText: "clear words with meaning now"
      });
      if (candidate?.type === "dominating") {
        first = candidate;
        break;
      }
    }

    const immediate = detector.evaluate({
      now: 10_400,
      activeSpeakerId: "a",
      isSpeakerClaiming: true,
      rms: 0.12,
      transcriptText: "clear words with meaning now"
    });
    expect(first?.type).toBe("dominating");
    expect(immediate).toBeNull();
  });
});
