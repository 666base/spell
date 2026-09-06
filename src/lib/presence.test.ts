import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useOpenTransition } from "./presence";

describe("useOpenTransition", () => {
  it("does not mark first paint as animating", () => {
    const { result } = renderHook(() => useOpenTransition(true));
    expect(result.current.state).toBe("open");
    expect(result.current.animating).toBe(false);
  });

  it("animates only after a later toggle", async () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useOpenTransition(open, 20),
      { initialProps: { open: true } },
    );

    rerender({ open: false });
    expect(result.current.animating).toBe(true);
    expect(result.current.state).toBe("closed");
    await waitFor(() => expect(result.current.animating).toBe(false));
  });
});
