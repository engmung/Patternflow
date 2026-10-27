// Write, Preview, Post: the comment went up and the field came back as an
// empty preview box, the Preview tab still picked and greyed out, no textarea
// anywhere. Writing a second comment meant finding "Write" first. A preview
// of nothing is what the disabled tab is there to prevent, so the field goes
// back to Write when its text goes.

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BodyComposer from "./BodyComposer";
import CommentSection from "./CommentSection";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/community/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "u1", username: "ada" } }, isPending: false }),
  },
}));

function Field({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <BodyComposer value={value} onChange={setValue} maxLength={2000} label="Comment" grow="comment" />
      <button type="button" onClick={() => setValue("")}>
        clear
      </button>
    </>
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });

describe("BodyComposer", () => {
  it("goes back to Write when its text is cleared while previewing", () => {
    render(<Field initial="**hello**" />);
    fireEvent.click(tab("Preview"));
    expect(screen.queryByRole("textbox", { name: "Comment" })).toBeNull();
    expect(tab("Preview").getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "clear" }));

    expect((screen.getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement).value).toBe("");
    expect(tab("Write").getAttribute("aria-selected")).toBe("true");
    expect(tab("Preview").getAttribute("aria-selected")).toBe("false");
    expect((tab("Preview") as HTMLButtonElement).disabled).toBe(true);
  });

  it("stays on Write as the next text is typed", () => {
    render(<Field initial="first" />);
    fireEvent.click(tab("Preview"));
    fireEvent.click(screen.getByRole("button", { name: "clear" }));

    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), { target: { value: "s" } });

    // One letter in, the field is still a textarea; the old preview does not
    // come back on its own.
    expect((screen.getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement).value).toBe("s");
    expect(tab("Write").getAttribute("aria-selected")).toBe("true");
    expect((tab("Preview") as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps the preview while the text is there", () => {
    render(<Field initial="still here" />);
    fireEvent.click(tab("Preview"));
    expect(screen.getByText("still here")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Comment" })).toBeNull();
  });
});

describe("posting from Preview", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true }, { status: 201 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    refresh.mockReset();
  });

  it("brings the comment field back empty, on Write", async () => {
    render(<CommentSection patternId="p1" comments={[]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), { target: { value: "nice *knobs*" } });
    fireEvent.click(tab("Preview"));
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((screen.getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement).value).toBe("");
    expect(tab("Write").getAttribute("aria-selected")).toBe("true");
  });
});
