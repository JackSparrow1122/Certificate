import { codeToDocId, docIdToCode } from "../src/utils/projectCodeUtils";

const LOCAL_DB_KEY = "erp_local_db_v1";

const defaultStore = () => ({
  counters: {
    projectCode: 0,
    certificate: 0,
    organization: 0,
    user: 0,
  },
  colleges: {},
  projectCodes: {},
  students: {},
  certificates: {},
  organizations: {},
  certificateProjectEnrollments: {},
  users: {},
  student_users: {},
});

const nowIso = () => new Date().toISOString();
const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();
const ACTIVE_FILTER = (data) => (data?.isActive ?? true) !== false;

const readStore = () => {
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw);
    return {
      ...defaultStore(),
      ...parsed,
      counters: {
        ...defaultStore().counters,
        ...(parsed?.counters || {}),
      },
      colleges: parsed?.colleges || {},
      projectCodes: parsed?.projectCodes || {},
      students: parsed?.students || {},
      certificates: parsed?.certificates || {},
      organizations: parsed?.organizations || {},
      certificateProjectEnrollments:
        parsed?.certificateProjectEnrollments || {},
      users: parsed?.users || {},
      student_users: parsed?.student_users || {},
    };
  } catch {
    return defaultStore();
  }
};

const writeStore = (store) => {
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(store));
};

const withStore = (handler) => {
  const store = readStore();
  const result = handler(store);
  writeStore(store);
  return result;
};

export const resetLocalDb = async () => {
  localStorage.removeItem(LOCAL_DB_KEY);
  window.dispatchEvent(new CustomEvent("erp:local-db-reset"));
  return true;
};

const generateId = (store, key, prefix) => {
  store.counters[key] = Number(store.counters[key] || 0) + 1;
  return `${prefix}_${store.counters[key]}`;
};

const findProjectCodeEntry = (store, predicate) =>
  Object.entries(store.projectCodes).find(([, row]) => predicate(row));

const ensureProjectNode = (store, projectCode, collegeCode = "") => {
  const projectDocId = codeToDocId(projectCode);
  if (!store.students[projectDocId]) {
    store.students[projectDocId] = {
      projectCode,
      collegeCode,
      isActive: true,
      updatedAt: nowIso(),
      students_list: {},
    };
  }
  return { projectDocId, node: store.students[projectDocId] };
};

const getCertificateNameById = (store, certificateId) =>
  store.certificates[certificateId]?.name || "";

const getCertificateIdsByProjectCode = (store, projectCode) => {
  const ids = Object.values(store.certificateProjectEnrollments)
    .filter(
      (row) => String(row.projectCode || "") === String(projectCode || ""),
    )
    .map((row) => row.certificateId)
    .filter(Boolean);
  return [...new Set(ids)];
};

// Colleges
export const localAddCollege = async (collegeData) =>
  withStore((store) => {
    const collegeCode = String(collegeData?.college_code || "").trim();
    store.colleges[collegeCode] = {
      ...(store.colleges[collegeCode] || {}),
      college_name: collegeData.college_name,
      college_code: collegeCode,
      college_logo: collegeData.college_logo || "",
      project_codes: store.colleges[collegeCode]?.project_codes || [],
      updatedAt: nowIso(),
    };
    return collegeCode;
  });

export const localSeedColleges = async (collegesData = []) =>
  withStore((store) => {
    collegesData.forEach((college) => {
      const collegeCode = String(college.id || "").trim();
      store.colleges[collegeCode] = {
        college_name: college.name,
        college_code: collegeCode,
        college_logo: college.logo || "",
        project_codes: store.colleges[collegeCode]?.project_codes || [],
        updatedAt: nowIso(),
      };
    });
    return true;
  });

export const localGetAllColleges = async () => {
  const store = readStore();
  return Object.entries(store.colleges).map(([id, data]) => ({
    collegeCode: id,
    ...data,
  }));
};

export const localGetCollegeByCode = async (collegeCode) => {
  const store = readStore();
  const key = String(collegeCode || "").trim();
  const data = store.colleges[key];
  if (!data) return null;
  return { collegeCode: key, ...data };
};

export const localUpdateCollege = async (collegeCode, updateData) =>
  withStore((store) => {
    const key = String(collegeCode || "").trim();
    if (!store.colleges[key]) {
      store.colleges[key] = {
        college_code: key,
        project_codes: [],
      };
    }
    store.colleges[key] = {
      ...store.colleges[key],
      ...(updateData.college_name
        ? { college_name: updateData.college_name }
        : {}),
      ...(updateData.college_code
        ? { college_code: updateData.college_code }
        : {}),
      ...(updateData.college_logo
        ? { college_logo: updateData.college_logo }
        : {}),
      updatedAt: nowIso(),
    };
    return true;
  });

export const localDeleteCollege = async (collegeCode) =>
  withStore((store) => {
    delete store.colleges[String(collegeCode || "").trim()];
    return true;
  });

export const localCollegeExists = async (collegeCode) => {
  const store = readStore();
  return Boolean(store.colleges[String(collegeCode || "").trim()]);
};

export const localGetCollegeByName = async (collegeName) => {
  const store = readStore();
  const normalizedName = String(collegeName || "")
    .trim()
    .toLowerCase();
  const entry = Object.entries(store.colleges).find(
    ([, row]) =>
      String(row.college_name || "")
        .trim()
        .toLowerCase() === normalizedName,
  );
  if (!entry) return null;
  return { collegeCode: entry[0], ...entry[1] };
};

// Project Codes
export const localAddProjectCode = async (projectData) =>
  withStore((store) => {
    const normalizedCode = String(projectData.code || "").trim();
    const normalizedCollegeId = String(projectData.collegeId || "").trim();

    const existingEntry = findProjectCodeEntry(
      store,
      (row) =>
        String(row.collegeId || "") === normalizedCollegeId &&
        String(row.code || "") === normalizedCode,
    );

    const payload = {
      code: normalizedCode,
      collegeId: normalizedCollegeId,
      college: projectData.college,
      course: projectData.course,
      year: projectData.year,
      type: projectData.type,
      academicYear: projectData.academicYear,
      matched: projectData.matched || false,
      isActive: true,
      deletedAt: null,
      updatedAt: nowIso(),
    };

    let id;
    if (existingEntry) {
      id = existingEntry[0];
      store.projectCodes[id] = {
        ...store.projectCodes[id],
        ...payload,
      };
    } else {
      id = generateId(store, "projectCode", "pc");
      store.projectCodes[id] = {
        id,
        ...payload,
        createdAt: nowIso(),
      };
    }

    const collegeDocId =
      normalizedCollegeId || projectData.collegeCode || projectData.college;
    if (collegeDocId && store.colleges[collegeDocId]) {
      const existingCodes = Array.isArray(
        store.colleges[collegeDocId].project_codes,
      )
        ? store.colleges[collegeDocId].project_codes
        : [];
      if (!existingCodes.includes(normalizedCode)) {
        existingCodes.push(normalizedCode);
      }
      store.colleges[collegeDocId].project_codes = existingCodes;
      store.colleges[collegeDocId].updatedAt = nowIso();
    }

    const { node } = ensureProjectNode(
      store,
      normalizedCode,
      normalizedCollegeId,
    );
    node.projectCode = normalizedCode;
    node.collegeCode = normalizedCollegeId;
    node.isActive = true;
    node.updatedAt = nowIso();

    return id;
  });

export const localGetAllProjectCodes = async () => {
  const store = readStore();
  return Object.values(store.projectCodes).filter(
    (row) => row.isActive !== false,
  );
};

export const localGetProjectCodesByCollege = async (collegeId) => {
  const normalizedCollegeId = String(collegeId || "").trim();
  const store = readStore();
  return Object.values(store.projectCodes).filter(
    (row) =>
      String(row.collegeId || "") === normalizedCollegeId &&
      row.isActive !== false,
  );
};

export const localGetProjectCodeById = async (id) => {
  const store = readStore();
  return store.projectCodes[id] || null;
};

export const localUpdateProjectCode = async (id, updateData) =>
  withStore((store) => {
    if (!store.projectCodes[id]) return false;
    store.projectCodes[id] = {
      ...store.projectCodes[id],
      ...updateData,
      updatedAt: nowIso(),
    };
    return true;
  });

export const localSoftDeleteProjectCode = async (id, projectCode) =>
  withStore((store) => {
    const code = String(
      projectCode || store.projectCodes[id]?.code || "",
    ).trim();

    if (store.projectCodes[id]) {
      store.projectCodes[id] = {
        ...store.projectCodes[id],
        isActive: false,
        deletedAt: nowIso(),
        updatedAt: nowIso(),
      };
    }

    if (code) {
      const projectDocId = codeToDocId(code);
      const projectNode = store.students[projectDocId];
      if (projectNode) {
        projectNode.isActive = false;
        projectNode.updatedAt = nowIso();
        Object.values(projectNode.students_list || {}).forEach((student) => {
          student.isActive = false;
          student.updatedAt = nowIso();
        });
      }

      Object.values(store.student_users).forEach((studentUser) => {
        if (String(studentUser.projectCode || "") === code) {
          studentUser.isActive = false;
          studentUser.deletedAt = nowIso();
          studentUser.updatedAt = nowIso();
        }
      });
    }

    return true;
  });

// Students
export const localAddStudent = async (studentData) =>
  withStore((store) => {
    const projectCode = String(studentData.projectId || "").trim();
    const projectDocId = codeToDocId(projectCode);
    const studentId = String(studentData.id || "").trim();
    const collegeCode = String(studentData.collegeCode || "").trim();

    const certificateIds = getCertificateIdsByProjectCode(store, projectCode);
    const certificateNames = certificateIds
      .map((certificateId) => getCertificateNameById(store, certificateId))
      .filter(Boolean);

    const certificateResults = certificateIds.reduce((acc, certificateId) => {
      const certificateName = getCertificateNameById(store, certificateId);
      if (!certificateName) return acc;
      acc[certificateId] = {
        certificateId,
        certificateName,
        status: "enrolled",
        updatedAt: nowIso(),
      };
      return acc;
    }, {});

    const { node } = ensureProjectNode(store, projectCode, collegeCode);
    node.projectCode = projectCode;
    node.collegeCode = collegeCode;
    node.isActive = true;
    node.updatedAt = nowIso();

    node.students_list[studentId] = {
      id: studentId,
      name: studentData.name,
      gender: studentData.gender,
      dob: studentData.dob,
      projectId: projectCode,
      projectCode,
      courseYear: studentData.courseYear || "",
      collegeCode,
      course: studentData.course || "",
      semesterLabel: studentData.semesterLabel || "",
      trainingType: studentData.trainingType || "",
      currentSession: studentData.currentSession || "",
      certificateIds,
      enrolledCertificates: certificateNames,
      certificate: certificateNames[0] || studentData.certificate || "",
      certificateStatus: certificateIds.length > 0 ? "enrolled" : "",
      certificateResults,
      progress: studentData.progress || "0%",
      exams: studentData.exams || "0 / 0",
      tenthPercentage: studentData.tenthPercentage,
      twelfthPercentage: studentData.twelfthPercentage,
      admissionYear: studentData.admissionYear,
      currentSemester: studentData.currentSemester,
      email: studentData.email,
      phone: studentData.phone,
      isActive: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      OFFICIAL_DETAILS: {
        SN: studentId,
        "FULL NAME OF STUDENT": studentData.name || "",
        "EMAIL ID": studentData.email || "",
        "MOBILE NO.": studentData.phone || "",
        "BIRTH DATE": studentData.dob || "",
        GENDER: studentData.gender || "",
      },
      TENTH_DETAILS: {
        "10th OVERALL MARKS %": studentData.tenthPercentage,
      },
      TWELFTH_DETAILS: {
        "12th OVERALL MARKS %": studentData.twelfthPercentage,
      },
    };

    certificateIds.forEach((certificateId) => {
      if (store.certificates[certificateId]) {
        store.certificates[certificateId].enrolledCount =
          Number(store.certificates[certificateId].enrolledCount || 0) + 1;
        store.certificates[certificateId].updatedAt = nowIso();
      }
    });

    return studentId;
  });

export const localGetAllStudents = async () => {
  const store = readStore();
  const rows = [];
  Object.entries(store.students).forEach(([projectDocId, projectNode]) => {
    Object.entries(projectNode.students_list || {}).forEach(
      ([studentDocId, student]) => {
        rows.push({
          docId: studentDocId,
          id: studentDocId,
          projectCode: projectNode.projectCode || docIdToCode(projectDocId),
          ...student,
        });
      },
    );
  });
  return rows;
};

export const localGetStudentsByProject = async (projectId) => {
  const store = readStore();
  const projectDocId = codeToDocId(projectId);
  const projectNode = store.students[projectDocId];
  if (!projectNode) return [];

  return Object.entries(projectNode.students_list || {}).map(
    ([studentDocId, student]) => ({
      id: studentDocId,
      docId: studentDocId,
      projectCode: projectId,
      ...student,
    }),
  );
};

export const localGetStudentByDocId = async (studentDocId) => {
  if (!studentDocId) return null;
  const store = readStore();

  for (const [projectDocId, projectNode] of Object.entries(store.students)) {
    const student = projectNode.students_list?.[String(studentDocId)];
    if (student) {
      return {
        docId: String(studentDocId),
        projectCode: projectNode.projectCode || docIdToCode(projectDocId),
        ...student,
      };
    }
  }

  return null;
};

export const localUpdateStudent = async (projectCode, id, updateData) =>
  withStore((store) => {
    const projectDocId = codeToDocId(projectCode);
    const projectNode = store.students[projectDocId];
    if (!projectNode || !projectNode.students_list?.[String(id)]) {
      return false;
    }
    projectNode.students_list[String(id)] = {
      ...projectNode.students_list[String(id)],
      ...updateData,
      updatedAt: nowIso(),
    };
    return true;
  });

export const localDeleteStudent = async (projectCode, id) =>
  withStore((store) => {
    const projectDocId = codeToDocId(projectCode);
    const projectNode = store.students[projectDocId];
    if (!projectNode) return false;
    delete projectNode.students_list[String(id)];
    projectNode.updatedAt = nowIso();
    return true;
  });

export const localGetAllProjectCodesFromStudents = async () => {
  const store = readStore();
  const projectCodes = Object.entries(store.students)
    .filter(
      ([, projectNode]) =>
        Object.keys(projectNode.students_list || {}).length > 0,
    )
    .map(([projectDocId, projectNode]) => {
      const code = projectNode.projectCode || docIdToCode(projectDocId);
      return { code, docId: codeToDocId(code) };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  return projectCodes;
};

export const localGetStudentByEmail = async (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const all = await localGetAllStudents();
  return (
    all.find((student) => normalizeEmail(student.email) === normalized) || null
  );
};

export const localGetStudentById = async (studentId) => {
  const normalized = String(studentId || "").trim();
  if (!normalized) return null;
  const all = await localGetAllStudents();
  return all.find((student) => String(student.id || "") === normalized) || null;
};

export const localGetStudentByProjectAndId = async (projectCode, studentId) => {
  const normalizedProject = String(projectCode || "").trim();
  const normalizedStudent = String(studentId || "").trim();
  if (!normalizedProject || !normalizedStudent) return null;

  const list = await localGetStudentsByProject(normalizedProject);
  return (
    list.find((student) => String(student.id || "") === normalizedStudent) ||
    null
  );
};

export const localGetStudentForAuthUser = async ({ profile, user } = {}) => {
  const profileProjectCode = String(
    profile?.projectCode || profile?.projectId || "",
  ).trim();
  const profileStudentId = String(
    profile?.studentId || profile?.id || "",
  ).trim();
  const profileEmail = String(profile?.email || user?.email || "").trim();

  if (profileProjectCode && profileStudentId) {
    const byProjectAndId = await localGetStudentByProjectAndId(
      profileProjectCode,
      profileStudentId,
    );
    if (byProjectAndId) return byProjectAndId;
  }

  if (profileStudentId) {
    const byId = await localGetStudentById(profileStudentId);
    if (byId) return byId;
  }

  if (profileEmail) {
    const byEmail = await localGetStudentByEmail(profileEmail);
    if (byEmail) return byEmail;
  }

  return null;
};

// Certificates
export const localGetAllCertificates = async () => {
  const store = readStore();
  return Object.values(store.certificates)
    .filter((certificate) => (certificate?.isActive ?? true) !== false)
    .sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
};

export const localGetCertificatesByIds = async (certificateIds) => {
  if (!Array.isArray(certificateIds) || certificateIds.length === 0) return [];
  const store = readStore();
  return certificateIds
    .map((id) => store.certificates[id])
    .filter(Boolean)
    .map((certificate) => ({ ...certificate }));
};

export const localGetCertificateEnrollmentCounts = async (certificateIds) => {
  const ids = Array.isArray(certificateIds)
    ? [
        ...new Set(
          certificateIds.map((id) => String(id || "").trim()).filter(Boolean),
        ),
      ]
    : [];

  const counts = Object.fromEntries(ids.map((id) => [id, 0]));
  if (ids.length === 0) return counts;

  const idSet = new Set(ids);
  const store = readStore();

  Object.values(store.students || {}).forEach((projectNode) => {
    Object.values(projectNode?.students_list || {}).forEach((student) => {
      const studentCertificateIds = Array.isArray(student?.certificateIds)
        ? student.certificateIds
        : [];

      studentCertificateIds.forEach((certificateId) => {
        const normalizedId = String(certificateId || "").trim();
        if (!idSet.has(normalizedId)) return;
        counts[normalizedId] = Number(counts[normalizedId] || 0) + 1;
      });
    });
  });

  return counts;
};

export const localCreateCertificateAndEnrollStudents = async (
  certificateData,
) =>
  withStore((store) => {
    const id = generateId(store, "certificate", "cert");
    store.certificates[id] = {
      id,
      domain: certificateData.domain,
      name: certificateData.name,
      platform: certificateData.platform,
      examCode: certificateData.examCode,
      level: certificateData.level,
      enrolledCount: 0,
      isActive: true,
      deletedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    return { id, enrolledCount: 0 };
  });

export const localUpdateCertificate = async (certificateId, updateData) =>
  withStore((store) => {
    const id = String(certificateId || "").trim();
    if (!id || !store.certificates[id]) {
      throw new Error("Certificate not found.");
    }

    store.certificates[id] = {
      ...store.certificates[id],
      ...(updateData?.domain !== undefined
        ? { domain: updateData.domain }
        : {}),
      ...(updateData?.name !== undefined ? { name: updateData.name } : {}),
      ...(updateData?.platform !== undefined
        ? { platform: updateData.platform }
        : {}),
      ...(updateData?.examCode !== undefined
        ? { examCode: updateData.examCode }
        : {}),
      ...(updateData?.level !== undefined ? { level: updateData.level } : {}),
      updatedAt: nowIso(),
    };

    return { ...store.certificates[id] };
  });

export const localSoftDeleteCertificate = async (certificateId) =>
  withStore((store) => {
    const id = String(certificateId || "").trim();
    const certificate = store.certificates[id];
    if (!id || !certificate) {
      throw new Error("Certificate not found.");
    }

    let affectedStudents = 0;

    Object.values(store.students || {}).forEach((projectNode) => {
      Object.values(projectNode?.students_list || {}).forEach((student) => {
        const certificateIds = Array.isArray(student?.certificateIds)
          ? student.certificateIds
          : [];
        const hasCertificateId = certificateIds.includes(id);

        const resultMap =
          student?.certificateResults &&
          typeof student.certificateResults === "object"
            ? student.certificateResults
            : {};

        const existingResultEntry = resultMap[id];

        const legacyMatch =
          student?.certificateResult?.certificateId === id ||
          String(student?.certificate || "") ===
            String(certificate?.name || "");

        if (!hasCertificateId && !existingResultEntry && !legacyMatch) {
          return;
        }

        affectedStudents += 1;

        student.certificateResults = {
          ...resultMap,
          [id]: {
            ...(existingResultEntry || {}),
            certificateId: id,
            certificateName:
              existingResultEntry?.certificateName ||
              certificate?.name ||
              student?.certificate ||
              "",
            status:
              existingResultEntry?.status ||
              existingResultEntry?.result ||
              "enrolled",
            isDeleted: true,
            updatedAt: nowIso(),
          },
        };

        if (student?.certificateResult?.certificateId === id) {
          student.certificateResult = {
            ...student.certificateResult,
            isDeleted: true,
            updatedAt: nowIso(),
          };
        }

        student.updatedAt = nowIso();
      });
    });

    Object.keys(store.certificateProjectEnrollments || {}).forEach(
      (enrollmentId) => {
        const enrollment = store.certificateProjectEnrollments[enrollmentId];
        if (String(enrollment?.certificateId || "") === id) {
          delete store.certificateProjectEnrollments[enrollmentId];
        }
      },
    );

    store.certificates[id] = {
      ...certificate,
      isActive: false,
      deletedAt: nowIso(),
      updatedAt: nowIso(),
    };

    return {
      deleted: true,
      affectedStudents,
      certificateId: id,
    };
  });

export const localGetAllOrganizations = async () => {
  const store = readStore();
  return Object.values(store.organizations).sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")),
  );
};

export const localCreateOrganization = async ({ name, logoUrl = "" }) =>
  withStore((store) => {
    const normalizedName = String(name || "")
      .trim()
      .toLowerCase();

    if (!normalizedName) {
      throw new Error("Organisation name is required.");
    }

    const existing = Object.values(store.organizations).find(
      (organization) =>
        String(organization?.normalizedName || "") === normalizedName,
    );

    if (existing) {
      throw new Error("Organisation already exists.");
    }

    const id = generateId(store, "organization", "org");
    const organization = {
      id,
      name: String(name || "").trim(),
      logoUrl: String(logoUrl || "").trim(),
      normalizedName,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    store.organizations[id] = organization;
    return organization;
  });

export const localUpdateOrganization = async (
  organizationId,
  { name, logoUrl },
) =>
  withStore((store) => {
    const id = String(organizationId || "").trim();
    if (!id || !store.organizations[id]) {
      throw new Error("Organisation not found.");
    }

    const normalizedName = String(name || "")
      .trim()
      .toLowerCase();

    if (!normalizedName) {
      throw new Error("Organisation name is required.");
    }

    const duplicate = Object.values(store.organizations).find(
      (organization) =>
        String(organization?.id || "") !== id &&
        String(organization?.normalizedName || "") === normalizedName,
    );

    if (duplicate) {
      throw new Error("Organisation already exists.");
    }

    store.organizations[id] = {
      ...store.organizations[id],
      name: String(name || "").trim(),
      logoUrl: String(logoUrl || "").trim(),
      normalizedName,
      updatedAt: nowIso(),
    };

    return { ...store.organizations[id] };
  });

export const localEnrollProjectCodeIntoCertificate = async ({
  certificateId,
  certificateName,
  projectCode,
}) =>
  withStore((store) => {
    const enrollmentDocId = `${certificateId}__${encodeURIComponent(projectCode)}`;
    store.certificateProjectEnrollments[enrollmentDocId] = {
      certificateId,
      certificateName,
      projectCode,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    const projectDocId = codeToDocId(projectCode);
    const projectNode = store.students[projectDocId];
    if (!projectNode) {
      return { newlyEnrolledCount: 0, matchedStudentsCount: 0 };
    }

    let newlyEnrolledCount = 0;
    const studentsList = Object.values(projectNode.students_list || {});

    studentsList.forEach((student) => {
      const currentCertificateIds = Array.isArray(student.certificateIds)
        ? student.certificateIds
        : [];
      if (currentCertificateIds.includes(certificateId)) {
        return;
      }

      newlyEnrolledCount += 1;
      const existingCertificateResults =
        student.certificateResults &&
        typeof student.certificateResults === "object"
          ? student.certificateResults
          : {};

      student.certificate = certificateName;
      student.certificateIds = [...currentCertificateIds, certificateId];
      student.certificateStatus = "enrolled";
      student.enrolledCertificates = [
        ...(Array.isArray(student.enrolledCertificates)
          ? student.enrolledCertificates
          : []),
      ].filter((value, index, arr) => value && arr.indexOf(value) === index);
      if (!student.enrolledCertificates.includes(certificateName)) {
        student.enrolledCertificates.push(certificateName);
      }
      student.certificateResults = {
        ...existingCertificateResults,
        [certificateId]: {
          certificateId,
          certificateName,
          status: "enrolled",
          isDeleted: false,
          updatedAt: nowIso(),
        },
      };
      student.updatedAt = nowIso();
    });

    if (store.certificates[certificateId]) {
      store.certificates[certificateId].enrolledCount =
        Number(store.certificates[certificateId].enrolledCount || 0) +
        newlyEnrolledCount;
      store.certificates[certificateId].updatedAt = nowIso();
    }

    return {
      newlyEnrolledCount,
      matchedStudentsCount: studentsList.length,
    };
  });

export const localGetAssignedProjectCodesForCertificate = async (
  certificateId,
) => {
  const store = readStore();
  const projectCodes = Object.values(store.certificateProjectEnrollments)
    .filter(
      (row) => String(row.certificateId || "") === String(certificateId || ""),
    )
    .map((row) => row.projectCode)
    .filter(Boolean);
  return [...new Set(projectCodes)].sort((a, b) => a.localeCompare(b));
};

export const localGetCertificatesByProjectCode = async (projectCode) => {
  const normalizedProjectCode = String(projectCode || "").trim();
  if (!normalizedProjectCode) return [];

  const normalizeForCompare = (value) =>
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

  const targetCode = normalizeForCompare(normalizedProjectCode);
  const store = readStore();

  const enrollmentRows = Object.values(
    store.certificateProjectEnrollments,
  ).filter((row) => normalizeForCompare(row.projectCode) === targetCode);
  const certificateIds = [
    ...new Set(enrollmentRows.map((row) => row.certificateId).filter(Boolean)),
  ];

  return certificateIds
    .map((certificateId) => store.certificates[certificateId])
    .filter((certificate) => (certificate?.isActive ?? true) !== false)
    .filter(Boolean)
    .map((certificate) => ({ ...certificate }));
};

export const localUnassignProjectCodeFromCertificate = async ({
  certificateId,
  certificateName,
  projectCode,
  preserveStudentCertificateData = false,
}) =>
  withStore((store) => {
    const enrollmentDocId = `${certificateId}__${encodeURIComponent(projectCode)}`;

    const projectDocId = codeToDocId(projectCode);
    const projectNode = store.students[projectDocId];
    if (!projectNode) {
      delete store.certificateProjectEnrollments[enrollmentDocId];
      return { unenrolledCount: 0 };
    }

    let unenrolledCount = 0;
    Object.values(projectNode.students_list || {}).forEach((student) => {
      const certificateIds = Array.isArray(student.certificateIds)
        ? student.certificateIds
        : [];
      if (!certificateIds.includes(certificateId)) {
        return;
      }

      unenrolledCount += 1;
      if (preserveStudentCertificateData) {
        return;
      }

      const updatedCertificateIds = certificateIds.filter(
        (id) => id !== certificateId,
      );
      const enrolledCertificates = Array.isArray(student.enrolledCertificates)
        ? student.enrolledCertificates
        : [];
      const updatedEnrolledCertificates = enrolledCertificates.filter(
        (name) => name !== certificateName,
      );

      const existingCertificateResults =
        student.certificateResults &&
        typeof student.certificateResults === "object"
          ? student.certificateResults
          : {};
      const updatedCertificateResults = { ...existingCertificateResults };
      delete updatedCertificateResults[certificateId];

      student.certificateIds = updatedCertificateIds;
      student.enrolledCertificates = updatedEnrolledCertificates;
      student.certificateResults = updatedCertificateResults;
      if ((student.certificate || "") === certificateName) {
        student.certificate = updatedEnrolledCertificates[0] || "";
      }
      if (updatedCertificateIds.length === 0) {
        student.certificateStatus = "";
      }
      if (
        student.certificateResult &&
        student.certificateResult.certificateId === certificateId
      ) {
        student.certificateResult = null;
      }
      student.updatedAt = nowIso();
    });

    if (store.certificates[certificateId]) {
      store.certificates[certificateId].enrolledCount = Math.max(
        0,
        Number(store.certificates[certificateId].enrolledCount || 0) -
          unenrolledCount,
      );
      store.certificates[certificateId].updatedAt = nowIso();
    }

    delete store.certificateProjectEnrollments[enrollmentDocId];
    return { unenrolledCount };
  });

// Users/Admins
export const localCreateStudentAuthUser = async (studentData) =>
  withStore((store) => {
    const email = normalizeEmail(studentData?.email);
    const name = String(studentData?.name || "").trim();
    const projectCode = String(studentData?.projectCode || "").trim();
    const collegeCode =
      String(studentData?.collegeCode || "").trim() ||
      String(projectCode || "").split("/")[0] ||
      "";
    const studentId = String(studentData?.studentId || "").trim();

    const existingEntry = Object.entries(store.student_users).find(
      ([, user]) => normalizeEmail(user.email) === email,
    );

    if (existingEntry) {
      const uid = existingEntry[0];
      store.student_users[uid] = {
        ...store.student_users[uid],
        uid,
        email,
        name,
        role: "student",
        projectCode,
        collegeCode,
        studentId,
        isActive: true,
        deletedAt: null,
        updatedAt: nowIso(),
      };
      return { uid, email, skippedExisting: true };
    }

    const uid = generateId(store, "user", "stu");
    store.student_users[uid] = {
      uid,
      email,
      name,
      role: "student",
      projectCode,
      collegeCode,
      studentId,
      isActive: true,
      deletedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    return { uid, email };
  });

export const localCreateCollegeAdmin = async (adminData, collegeCode) =>
  withStore((store) => {
    const normalizedEmail = normalizeEmail(adminData?.email);
    const existingEntry = Object.entries(store.users).find(
      ([, user]) => normalizeEmail(user.email) === normalizedEmail,
    );

    if (existingEntry) {
      const uid = existingEntry[0];
      store.users[uid] = {
        ...store.users[uid],
        uid,
        name: adminData?.name,
        email: normalizedEmail,
        role: "collegeAdmin",
        collegeCode: String(collegeCode || "").trim(),
        isActive: true,
        deletedAt: null,
        updatedAt: nowIso(),
      };
      return uid;
    }

    const uid = generateId(store, "user", "adm");
    store.users[uid] = {
      uid,
      name: adminData?.name,
      email: normalizedEmail,
      role: "collegeAdmin",
      collegeCode: String(collegeCode || "").trim(),
      isActive: true,
      deletedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    return uid;
  });

export const localCreateSuperAdmin = async (adminData) =>
  withStore((store) => {
    const normalizedEmail = normalizeEmail(adminData?.email);
    const existingEntry = Object.entries(store.users).find(
      ([, user]) => normalizeEmail(user.email) === normalizedEmail,
    );

    if (existingEntry) {
      const uid = existingEntry[0];
      store.users[uid] = {
        ...store.users[uid],
        uid,
        name: adminData?.name,
        email: normalizedEmail,
        role: "superAdmin",
        isActive: true,
        deletedAt: null,
        updatedAt: nowIso(),
      };
      return uid;
    }

    const uid = generateId(store, "user", "adm");
    store.users[uid] = {
      uid,
      name: adminData?.name,
      email: normalizedEmail,
      role: "superAdmin",
      isActive: true,
      deletedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    return uid;
  });

export const localGetUserByEmail = async (email) => {
  const store = readStore();
  const normalizedEmail = normalizeEmail(email);
  const entry = Object.entries(store.users).find(
    ([, user]) => normalizeEmail(user.email) === normalizedEmail,
  );
  if (!entry) return null;
  return { uid: entry[0], ...entry[1] };
};

export const localGetUserByUID = async (uid) => {
  const store = readStore();
  const key = String(uid || "").trim();
  const user = store.users[key];
  if (!user || !ACTIVE_FILTER(user)) return null;
  return { uid: key, ...user };
};

export const localGetUserByCollegeCode = async (collegeCode) => {
  const store = readStore();
  const code = String(collegeCode || "").trim();
  const entry = Object.entries(store.users).find(
    ([, user]) =>
      String(user.collegeCode || "") === code &&
      String(user.role || "") === "collegeAdmin" &&
      ACTIVE_FILTER(user),
  );
  if (!entry) return null;
  return { uid: entry[0], ...entry[1] };
};

export const localGetAllAdmins = async () => {
  const store = readStore();
  return Object.entries(store.users)
    .filter(
      ([, user]) =>
        ["superAdmin", "collegeAdmin"].includes(String(user.role || "")) &&
        ACTIVE_FILTER(user),
    )
    .map(([uid, user]) => ({ uid, ...user }));
};

export const localUpdateAdmin = async (uid, updateData) =>
  withStore((store) => {
    const key = String(uid || "").trim();
    if (!store.users[key]) return false;
    store.users[key] = {
      ...store.users[key],
      ...updateData,
      updatedAt: nowIso(),
    };
    return true;
  });

export const localDeleteCollegeAdmin = async (uid) =>
  withStore((store) => {
    const key = String(uid || "").trim();
    if (!store.users[key]) return false;
    store.users[key].isActive = false;
    store.users[key].deletedAt = nowIso();
    store.users[key].updatedAt = nowIso();
    return true;
  });
