import { describe, expect, it } from "vitest";
import { aiFeatures } from "./moxie-ai";

const all = {
  moxieAi: true,
  enableCompletion: true,
  enableGrammarCheck: true,
  enableAskAi: true,
};

describe("aiFeatures", () => {
  it("offers each feature turned on while Moxie AI is on", () => {
    expect(aiFeatures(all)).toEqual({
      on: true,
      completion: true,
      grammar: true,
      chat: true,
    });
    expect(
      aiFeatures({ ...all, enableCompletion: false, enableAskAi: false }),
    ).toEqual({ on: true, completion: false, grammar: true, chat: false });
  });

  it("offers nothing while Moxie AI is off, whatever the features say", () => {
    expect(aiFeatures({ ...all, moxieAi: false })).toEqual({
      on: false,
      completion: false,
      grammar: false,
      chat: false,
    });
  });

  it("offers the tour its conversation with chat off, but not with Moxie AI off", () => {
    const chatOff = { ...all, enableAskAi: false };
    expect(aiFeatures(chatOff, true).chat).toBe(true);
    expect(aiFeatures({ ...chatOff, moxieAi: false }, true).chat).toBe(false);
  });
});
