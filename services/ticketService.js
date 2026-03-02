import { db } from "../src/firebase/config";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { isLocalDbMode } from "./dbModeService";
import {
  localAddHelpTicketRemark,
  localCreateHelpTicket,
  localGetHelpTicketRemarks,
  localGetHelpTickets,
  localUpdateHelpTicketStatus,
} from "./localDbService";

const HELP_TICKETS_COLLECTION = "helpTickets";
const HELP_TICKET_REMARKS_SUBCOLLECTION = "remarks";

const getSortTimestamp = (row = {}) => {
  const updatedAt = row?.updatedAt;
  const createdAt = row?.createdAt;

  const updatedTime =
    typeof updatedAt?.toDate === "function"
      ? updatedAt.toDate().getTime()
      : new Date(updatedAt || 0).getTime();
  if (Number.isFinite(updatedTime) && updatedTime > 0) return updatedTime;

  const createdTime =
    typeof createdAt?.toDate === "function"
      ? createdAt.toDate().getTime()
      : new Date(createdAt || 0).getTime();
  return Number.isFinite(createdTime) ? createdTime : 0;
};

const sortTicketsDesc = (rows = []) =>
  [...rows].sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));

export const TICKET_CATEGORY_OPTIONS = ["General", "Bugs", "Enquiry"];
export const TICKET_PRIORITY_OPTIONS = ["Low", "Medium", "High", "Critical"];
export const TICKET_STATUS_OPTIONS = [
  "Open",
  "In Progress",
  "On Hold",
  "Pending Info",
  "Resolved",
  "Rejected",
  "Closed",
];

const normalizeTicket = (ticketDoc) => {
  const row = ticketDoc?.data ? ticketDoc.data() : ticketDoc || {};
  return {
    id: ticketDoc?.id || row?.id || "",
    ...row,
  };
};

export const createHelpTicket = async (ticketData = {}) => {
  if (isLocalDbMode()) {
    return localCreateHelpTicket(ticketData);
  }

  const payload = {
    subject: String(ticketData.subject || "").trim(),
    description: String(ticketData.description || "").trim(),
    category: String(ticketData.category || "General").trim() || "General",
    priority: String(ticketData.priority || "Medium").trim() || "Medium",
    status: String(ticketData.status || "Open").trim() || "Open",
    collegeCode: String(ticketData.collegeCode || "").trim(),
    collegeName: String(ticketData.collegeName || "").trim(),
    createdByUid: String(ticketData.createdByUid || "").trim(),
    createdByEmail: String(ticketData.createdByEmail || "")
      .trim()
      .toLowerCase(),
    createdByName: String(ticketData.createdByName || "").trim(),
    createdByRole: String(ticketData.createdByRole || "").trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastRemarkAt: null,
  };

  const ticketRef = await addDoc(
    collection(db, HELP_TICKETS_COLLECTION),
    payload,
  );
  return { id: ticketRef.id, ...payload };
};

export const getHelpTickets = async ({ role, uid, email } = {}) => {
  if (isLocalDbMode()) {
    return localGetHelpTickets({
      role,
      createdByUid: uid,
      createdByEmail: email,
    });
  }

  const normalizedRole = String(role || "")
    .trim()
    .toLowerCase();
  const normalizedUid = String(uid || "").trim();
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (normalizedRole === "collegeadmin") {
    const filteredCollection = collection(db, HELP_TICKETS_COLLECTION);

    // Run uid and email queries in parallel and merge, avoids sequential fallback
    const queries = [];
    if (normalizedUid) {
      queries.push(
        getDocs(
          query(filteredCollection, where("createdByUid", "==", normalizedUid)),
        ),
      );
    }
    if (normalizedEmail) {
      queries.push(
        getDocs(
          query(
            filteredCollection,
            where("createdByEmail", "==", normalizedEmail),
          ),
        ),
      );
    }

    if (queries.length === 0) return [];

    const snapshots = await Promise.all(queries);
    const seenIds = new Set();
    const tickets = [];
    snapshots.forEach((snap) => {
      snap.docs.forEach((docSnap) => {
        if (!seenIds.has(docSnap.id)) {
          seenIds.add(docSnap.id);
          tickets.push(normalizeTicket(docSnap));
        }
      });
    });
    return sortTicketsDesc(tickets);
  }

  const snapshot = await getDocs(
    query(
      collection(db, HELP_TICKETS_COLLECTION),
      orderBy("updatedAt", "desc"),
    ),
  );
  return sortTicketsDesc(
    snapshot.docs.map((docSnap) => normalizeTicket(docSnap)),
  );
};

export const updateHelpTicketStatus = async ({ ticketId, status, actor }) => {
  if (isLocalDbMode()) {
    return localUpdateHelpTicketStatus(ticketId, status, actor);
  }

  const id = String(ticketId || "").trim();
  if (!id) throw new Error("Ticket id is required.");

  const payload = {
    status: String(status || "Open").trim() || "Open",
    updatedAt: serverTimestamp(),
    updatedByUid: String(actor?.uid || "").trim(),
    updatedByName: String(actor?.name || "").trim(),
    updatedByRole: String(actor?.role || "").trim(),
  };

  await setDoc(doc(db, HELP_TICKETS_COLLECTION, id), payload, { merge: true });
  return { id, ...payload };
};

export const addHelpTicketRemark = async ({ ticketId, text, author }) => {
  const id = String(ticketId || "").trim();
  const remarkText = String(text || "").trim();
  if (!id) throw new Error("Ticket id is required.");
  if (!remarkText) throw new Error("Remark text is required.");

  if (isLocalDbMode()) {
    return localAddHelpTicketRemark(id, {
      text: remarkText,
      authorUid: author?.uid,
      authorName: author?.name,
      authorRole: author?.role,
    });
  }

  const remarksCollection = collection(
    db,
    HELP_TICKETS_COLLECTION,
    id,
    HELP_TICKET_REMARKS_SUBCOLLECTION,
  );

  const remarkRef = await addDoc(remarksCollection, {
    text: remarkText,
    createdAt: serverTimestamp(),
    authorUid: String(author?.uid || "").trim(),
    authorName: String(author?.name || "").trim(),
    authorRole: String(author?.role || "").trim(),
  });

  await setDoc(
    doc(db, HELP_TICKETS_COLLECTION, id),
    {
      lastRemarkAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return { id: remarkRef.id, text: remarkText };
};

export const getHelpTicketRemarks = async (ticketId) => {
  const id = String(ticketId || "").trim();
  if (!id) return [];

  if (isLocalDbMode()) {
    return localGetHelpTicketRemarks(id);
  }

  const remarksQuery = query(
    collection(
      db,
      HELP_TICKETS_COLLECTION,
      id,
      HELP_TICKET_REMARKS_SUBCOLLECTION,
    ),
    orderBy("createdAt", "desc"),
  );

  const snapshot = await getDocs(remarksQuery);
  return snapshot.docs.map((docSnap) => normalizeTicket(docSnap));
};
