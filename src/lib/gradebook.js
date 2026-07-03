// Construction PURE du carnet de notes (matrice élèves × examens), testable.

export function buildGradebook(students, examRecords) {
  const records = Array.isArray(examRecords) ? examRecords : [];
  const exams = records.map((r) => ({
    id: r.id,
    title: r.title,
    endedAt: r.endedAt,
    verifyCode: r.verifyCode || null,
  }));
  const rows = (students || []).map((s) => {
    const notes = {};
    let sum = 0;
    let count = 0;
    for (const r of records) {
      const entry = (r.leaderboard || []).find((p) => p.studentId === s.id);
      if (entry && typeof entry.note === "number") {
        notes[r.id] = entry.note;
        sum += entry.note;
        count += 1;
      } else {
        notes[r.id] = null; // absent / pas de note
      }
    }
    return {
      studentId: s.id,
      name: s.name,
      notes,
      avgNote: count ? Math.round((sum / count) * 10) / 10 : null,
    };
  });
  return { exams, rows };
}
