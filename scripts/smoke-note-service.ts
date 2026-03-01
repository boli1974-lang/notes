import * as noteService from "@/lib/services/noteService";

function pass(message: string): void {
  console.log(`PASS: ${message}`);
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

async function main(): Promise<void> {
  const marker = `smoke-note-service-${Date.now()}`;
  let noteId: string | null = null;

  try {
    const created = await noteService.createNote({
      title: marker,
      content: `content-${marker}`,
    });
    noteId = created.id;
    pass("createNote created a note via service");

    const fetched = await noteService.getNoteById(noteId);
    assert(fetched !== null, "getNoteById should return the created note");
    pass("getNoteById returned created note");

    const listed = await noteService.listNotes({ search: marker, take: 20 });
    assert(
      listed.some((note) => note.id === noteId),
      "listNotes should include created note",
    );
    pass("listNotes included created note");

    const deleted = await noteService.softDeleteNote(noteId);
    assert(deleted, "softDeleteNote should succeed");
    pass("softDeleteNote succeeded");

    const afterDelete = await noteService.getNoteById(noteId);
    assert(afterDelete === null, "default getNoteById should exclude deleted note");
    pass("default getNoteById excludes deleted note");

    const restored = await noteService.restoreNote(noteId);
    assert(restored, "restoreNote should succeed");

    const afterRestore = await noteService.getNoteById(noteId);
    assert(afterRestore !== null, "restored note should be visible again");
    pass("restoreNote restored note visibility");

    pass("noteService smoke test completed");
  } finally {
    if (noteId) {
      await noteService.hardDeleteNote(noteId);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
