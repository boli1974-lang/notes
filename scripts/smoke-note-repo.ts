import * as noteRepository from "@/lib/repositories/noteRepository";
import { prisma } from "@/lib/db";

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
  const marker = `smoke-note-repo-${Date.now()}`;
  let noteId: string | null = null;

  try {
    const created = await noteRepository.createNote({
      title: marker,
      content: `content-${marker}`,
    });
    noteId = created.id;
    pass("createNote created a test note");

    const fetched = await noteRepository.getNoteById(noteId);
    assert(fetched !== null, "getNoteById should return created note");
    assert(fetched.title === marker, "getNoteById returned unexpected title");
    pass("getNoteById returned created note");

    const list = await noteRepository.listNotes({ search: marker, take: 20 });
    assert(
      list.some((note) => note.id === noteId),
      "listNotes should include created note",
    );
    pass("listNotes included created note");

    const softDeleted = await noteRepository.softDeleteNote(noteId);
    assert(softDeleted, "softDeleteNote should succeed");
    pass("softDeleteNote succeeded");

    const afterDeleteById = await noteRepository.getNoteById(noteId);
    assert(afterDeleteById === null, "default getNoteById should exclude soft-deleted note");

    const afterDeleteList = await noteRepository.listNotes({ search: marker, take: 20 });
    assert(
      !afterDeleteList.some((note) => note.id === noteId),
      "default listNotes should exclude soft-deleted note",
    );
    pass("default reads exclude soft-deleted note");

    if (typeof noteRepository.restoreNote === "function") {
      const restored = await noteRepository.restoreNote(noteId);
      assert(restored, "restoreNote should succeed");

      const afterRestoreById = await noteRepository.getNoteById(noteId);
      assert(afterRestoreById !== null, "restored note should reappear in getNoteById");

      const afterRestoreList = await noteRepository.listNotes({ search: marker, take: 20 });
      assert(
        afterRestoreList.some((note) => note.id === noteId),
        "restored note should reappear in listNotes",
      );
      pass("restoreNote restored note visibility");
    }

    pass("Smoke test completed successfully");
  } finally {
    if (noteId) {
      await prisma.note.deleteMany({ where: { id: noteId } });
    }
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
