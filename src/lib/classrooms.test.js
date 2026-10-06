import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import {
  createClass,
  listClasses,
  getClass,
  renameClass,
  deleteClass,
  addStudent,
  removeStudent,
  MAX_CLASSES_PER_ACCOUNT,
} from "./classrooms.js";

test("createClass → listClasses → getClass (appartenance)", async () => {
  setRedisClient(createFakeRedis());
  const r = await createClass("acc1", "6ème A");
  assert.equal(r.ok, true);
  assert.equal(r.classroom.name, "6ème A");

  const list = await listClasses("acc1");
  assert.equal(list.length, 1);
  assert.equal(list[0].studentCount, 0);

  assert.equal((await getClass("acc1", r.classroom.id)).name, "6ème A");
  assert.equal(await getClass("autre", r.classroom.id), null); // autre compte
});

test("addStudent / removeStudent", async () => {
  setRedisClient(createFakeRedis());
  const { classroom } = await createClass("acc1", "6ème A");
  const a = await addStudent("acc1", classroom.id, "Alice");
  await addStudent("acc1", classroom.id, "Bob");
  assert.equal((await getClass("acc1", classroom.id)).students.length, 2);
  assert.equal((await listClasses("acc1"))[0].studentCount, 2);

  await removeStudent("acc1", classroom.id, a.student.id);
  const after = await getClass("acc1", classroom.id);
  assert.equal(after.students.length, 1);
  assert.equal(after.students[0].name, "Bob");
});

test("renameClass et deleteClass", async () => {
  setRedisClient(createFakeRedis());
  const { classroom } = await createClass("acc1", "Provisoire");
  await renameClass("acc1", classroom.id, "5ème B");
  assert.equal((await getClass("acc1", classroom.id)).name, "5ème B");

  await deleteClass("acc1", classroom.id);
  assert.equal(await getClass("acc1", classroom.id), null);
  assert.equal((await listClasses("acc1")).length, 0);
});

test("opérations refusées sur une classe d'un autre compte", async () => {
  setRedisClient(createFakeRedis());
  const { classroom } = await createClass("acc1", "6ème A");
  assert.equal((await addStudent("acc2", classroom.id, "X")).ok, false);
  assert.equal((await deleteClass("acc2", classroom.id)).ok, false);
});

test("createClass : plafonne le nombre de classes sans perte silencieuse", async () => {
  setRedisClient(createFakeRedis());
  // On remplit jusqu'au plafond.
  for (let i = 0; i < MAX_CLASSES_PER_ACCOUNT; i++) {
    const r = await createClass("acc_1", `Classe ${i}`);
    assert.equal(r.ok, true);
  }
  // La suivante est refusée EXPLICITEMENT — pas de troncature qui rendrait
  // une classe existante inaccessible.
  const trop = await createClass("acc_1", "Une de trop");
  assert.equal(trop.ok, false);
  assert.equal(trop.status, 409);
  assert.match(trop.error, /limite/i);

  // Toutes les classes créées restent listées : rien n'a été perdu.
  assert.equal((await listClasses("acc_1")).length, MAX_CLASSES_PER_ACCOUNT);

  // Supprimer libère la place : le plafond n'est pas définitif.
  const premiere = (await listClasses("acc_1"))[0];
  assert.equal((await deleteClass("acc_1", premiere.id)).ok, true);
  assert.equal((await createClass("acc_1", "Remplaçante")).ok, true);
});

test("createClass : le plafond est propre à chaque compte", async () => {
  setRedisClient(createFakeRedis());
  for (let i = 0; i < MAX_CLASSES_PER_ACCOUNT; i++) {
    await createClass("acc_1", `Classe ${i}`);
  }
  assert.equal((await createClass("acc_2", "Première")).ok, true);
});
