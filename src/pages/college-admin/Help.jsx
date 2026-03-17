import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  addHelpTicketRemark,
  createHelpTicket,
  getHelpTicketRemarks,
  getHelpTickets,
  TICKET_CATEGORY_OPTIONS,
  TICKET_PRIORITY_OPTIONS,
} from "../../../services/ticketService";
import TicketDetailModal, {
  TicketViewActionButton,
} from "../../components/help/TicketDetailModal";

const STATUS_BADGE_CLASS = {
  Open: "bg-red-500 text-white",
  "In Progress": "bg-yellow-100 text-yellow-700",
  "Pending Info": "bg-orange-100 text-orange-700",
  "On Hold": "bg-indigo-100 text-indigo-700",
  Resolved: "bg-green-100 text-green-700",
  Rejected: "bg-rose-100 text-rose-700",
  Closed: "bg-gray-100 text-gray-700",
};

const timeAgo = (value) => {
  if (!value) return "-";
  const ts =
    typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  const ms = Date.now() - ts.getTime();
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
};

export default function Help() {
  const { user, profile, role } = useAuth();
  const [activeTab, setActiveTab] = useState("create");
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [remarks, setRemarks] = useState([]);
  const [loadingRemarks, setLoadingRemarks] = useState(false);
  const [addingRemark, setAddingRemark] = useState(false);

  const [form, setForm] = useState({
    subject: "",
    description: "",
    category: "General",
    priority: "Medium",
  });

  const loadTickets = async () => {
    const email = String(user?.email || "")
      .trim()
      .toLowerCase();
    if (!user?.uid && !email) return;
    setLoadingTickets(true);
    try {
      const rows = await getHelpTickets({
        role: "collegeAdmin",
        uid: user.uid,
        email,
      });
      setTickets(rows || []);
    } catch (error) {
      console.error("Failed to load tickets:", error);
      setTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [user?.uid, user?.email]);

  const myTicketsLabel = useMemo(
    () => `My Tickets (${tickets.length})`,
    [tickets.length],
  );

  const createTicketHandler = async (event) => {
    event.preventDefault();
    const subject = String(form.subject || "").trim();
    const description = String(form.description || "").trim();

    if (!subject || !description) {
      setMessage("Please fill subject and detailed description.");
      return;
    }

    setCreating(true);
    try {
      await createHelpTicket({
        subject,
        description,
        category: form.category,
        priority: form.priority,
        status: "Open",
        collegeCode:
          profile?.collegeCode ||
          profile?.college_code ||
          profile?.college ||
          "",
        collegeName:
          profile?.collegeName ||
          profile?.college_name ||
          profile?.college ||
          "",
        createdByUid: user?.uid,
        createdByEmail: String(user?.email || "")
          .trim()
          .toLowerCase(),
        createdByName: profile?.name || user?.email || "College Admin",
        createdByRole: role || "collegeAdmin",
      });

      setForm({
        subject: "",
        description: "",
        category: "General",
        priority: "Medium",
      });
      setMessage("Ticket created successfully");
      setActiveTab("tickets");
      await loadTickets();
    } catch (error) {
      console.error("Failed to create ticket:", error);
      setMessage("Failed to create ticket");
    } finally {
      setCreating(false);
    }
  };

  const openTicketModal = async (ticket) => {
    setSelectedTicket(ticket);
    setLoadingRemarks(true);
    try {
      const rows = await getHelpTicketRemarks(ticket.id);
      setRemarks(rows || []);
    } catch (error) {
      console.error("Failed to load remarks:", error);
      setRemarks([]);
    } finally {
      setLoadingRemarks(false);
    }
  };

  const handleAddRemark = async (text) => {
    if (!selectedTicket || !text.trim()) return;

    if (String(selectedTicket.status || "") !== "Pending Info") {
      setMessage("You can add remark only when status is Pending Info.");
      return;
    }

    setAddingRemark(true);
    try {
      await addHelpTicketRemark({
        ticketId: selectedTicket.id,
        text,
        author: {
          uid: user?.uid,
          name: profile?.name || user?.email || "College Admin",
          role: role || "collegeAdmin",
        },
      });

      const rows = await getHelpTicketRemarks(selectedTicket.id);
      setRemarks(rows || []);
      await loadTickets();
      setMessage("Remark added successfully.");
    } catch (error) {
      console.error("Failed to add remark:", error);
      setMessage("Failed to add remark");
    } finally {
      setAddingRemark(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          Help &amp; Support
        </h1>
        <p className="mt-0.5 text-xs text-gray-600">
          Raise a support ticket or view your existing tickets
        </p>
      </div>

      <div className="grid grid-cols-1 gap-1 rounded-lg bg-gray-100 p-1 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setActiveTab("create")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            activeTab === "create"
              ? "bg-white text-gray-900 shadow"
              : "text-gray-500"
          }`}
        >
          Raise New Ticket
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tickets")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            activeTab === "tickets"
              ? "bg-white text-gray-900 shadow"
              : "text-gray-500"
          }`}
        >
          {myTicketsLabel}
        </button>
      </div>

      {activeTab === "create" && (
        <section className="overflow-hidden rounded-xl bg-white shadow">
          <div className="bg-[#012920] px-4 py-3">
            <h2 className="text-lg font-semibold text-white">
              Create a Support Ticket
            </h2>
            <p className="mt-0.5 text-xs text-white">
              Describe your issue in detail. Our support team will respond
              shortly.
            </p>
          </div>

          <form onSubmit={createTicketHandler} className="space-y-3 px-4 py-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-900">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.subject}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      subject: event.target.value.slice(0, 120),
                    }))
                  }
                  maxLength={120}
                  placeholder="Brief description of your issue"
                  className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-[#0B2A4A]"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  {form.subject.length}/120 characters
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-900">
                    Category
                  </label>
                  <select
                    value={form.category}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        category: event.target.value,
                      }))
                    }
                    className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs outline-none focus:border-[#0B2A4A]"
                  >
                    {TICKET_CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-900">
                    Priority
                  </label>
                  <select
                    value={form.priority}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        priority: event.target.value,
                      }))
                    }
                    className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs outline-none focus:border-[#0B2A4A]"
                  >
                    {TICKET_PRIORITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-900">
                Detailed Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    description: event.target.value.slice(0, 1000),
                  }))
                }
                maxLength={1000}
                rows={4}
                placeholder="Provide complete details about your issue"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0B2A4A]"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                {form.description.length}/1000 characters
              </p>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="h-9 w-full rounded-md bg-[#012920] text-sm font-medium text-white disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create Support Ticket"}
            </button>
          </form>
        </section>
      )}

      {activeTab === "tickets" && (
        <section className="overflow-hidden rounded-xl bg-white shadow">
          <div className="overflow-x-auto">
            <div className="min-w-180">
              <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr_0.5fr] gap-3 bg-[#012920] px-4 py-2.5 text-xs font-semibold text-white">
                <p>Subject</p>
                <p>Category</p>
                <p>Priority</p>
                <p>Status</p>
                <p>Created</p>
                <p className="text-right">Action</p>
              </div>

              <div className="divide-y">
                {loadingTickets ? (
                  <p className="px-4 py-4 text-sm text-gray-500">
                    Loading tickets...
                  </p>
                ) : tickets.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-gray-500">
                    No tickets yet.
                  </p>
                ) : (
                  tickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr_0.5fr] items-center gap-3 px-4 py-2.5 text-sm"
                    >
                      <p className="font-medium text-gray-900">
                        {ticket.subject}
                      </p>
                      <p>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                          {ticket.category}
                        </span>
                      </p>
                      <p>
                        <span className="rounded-full bg-[#0B2A4A] px-2 py-0.5 text-[11px] font-medium text-white">
                          {ticket.priority}
                        </span>
                      </p>
                      <p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_CLASS[ticket.status] || "bg-gray-100 text-gray-700"}`}
                        >
                          {ticket.status}
                        </span>
                      </p>
                      <p className="text-gray-600">
                        {timeAgo(ticket.createdAt)}
                      </p>
                      <div className="flex justify-end">
                        <TicketViewActionButton
                          onClick={() => openTicketModal(ticket)}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          role={role || "collegeAdmin"}
          onClose={() => setSelectedTicket(null)}
          onStatusChange={() => {}}
          statusUpdating={false}
          remarks={remarks}
          loadingRemarks={loadingRemarks}
          onAddRemark={handleAddRemark}
          addingRemark={addingRemark}
        />
      )}

      {message && (
        <div className="fixed bottom-6 right-6 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-800 shadow-lg">
          {message}
        </div>
      )}
    </div>
  );
}
