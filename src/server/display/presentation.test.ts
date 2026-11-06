import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { presentationSlideNeedsBikepark, shouldIncludePresentationSlide } from "./presentation";

describe("presentationSlideNeedsBikepark", () => {
  it("marks stalling-specific slide types", () => {
    assert.equal(presentationSlideNeedsBikepark("Openingstijden"), true);
    assert.equal(presentationSlideNeedsBikepark("Bikepark"), true);
    assert.equal(presentationSlideNeedsBikepark("Verwijssysteem"), true);
    assert.equal(presentationSlideNeedsBikepark("Article"), false);
  });
});

describe("shouldIncludePresentationSlide", () => {
  it("without bikeparkID in URL drops Bikepark and Openingstijden (slide2.cfm)", () => {
    const ctx = { bikeparkIdInUrl: false, stallingDiaHasText: false };
    assert.equal(shouldIncludePresentationSlide("Article", ctx), true);
    assert.equal(shouldIncludePresentationSlide("Verwijssysteem", ctx), true);
    assert.equal(shouldIncludePresentationSlide("Bikepark", ctx), false);
    assert.equal(shouldIncludePresentationSlide("Openingstijden", ctx), false);
  });

  it("with bikeparkID omits Bikepark when stalling dia is empty", () => {
    assert.equal(
      shouldIncludePresentationSlide("Bikepark", { bikeparkIdInUrl: true, stallingDiaHasText: false }),
      false
    );
    assert.equal(
      shouldIncludePresentationSlide("Bikepark", { bikeparkIdInUrl: true, stallingDiaHasText: true }),
      true
    );
    assert.equal(
      shouldIncludePresentationSlide("Openingstijden", { bikeparkIdInUrl: true, stallingDiaHasText: false }),
      true
    );
  });
});
