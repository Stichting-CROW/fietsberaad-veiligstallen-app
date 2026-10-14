import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { presentationSlideNeedsBikepark } from "./presentation";

describe("presentationSlideNeedsBikepark", () => {
  it("marks stalling-specific slide types", () => {
    assert.equal(presentationSlideNeedsBikepark("Openingstijden"), true);
    assert.equal(presentationSlideNeedsBikepark("Bikepark"), true);
    assert.equal(presentationSlideNeedsBikepark("Verwijssysteem"), true);
    assert.equal(presentationSlideNeedsBikepark("Article"), false);
  });
});
