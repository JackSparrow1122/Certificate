import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, HelpCircle } from "lucide-react";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import { useAuth } from "../../context/AuthContext";
import {
  addHelpTicketRemark,
  getHelpTicketRemarks,
  getHelpTickets,
  updateHelpTicketStatus,
} from "../../../services/ticketService";
import TicketDetailModal, {
  TicketViewActionButton,
} from "../../components/help/TicketDetailModal";

const STATUS_TABS = [
  "All",
  "Open",
  "In Progress",
  "Pending Info",
  "On Hold",
  "Resolved",
  "Rejected",
  "Closed",
];

const STATUS_BADGE_CLASS = {
  Open: "bg-red-500 text-white",
  "In Progress": "bg-yellow-100 text-yellow-700",
  "Pending Info": "bg-orange-100 text-orange-700",
  "On Hold": "bg-indigo-100 text-indigo-700",
  Resolved: "bg-green-100 text-green-700",
  Rejected: "bg-rose-100 text-rose-700",
  Closed: "bg-gray-100 text-gray-700",
};

const PRIORITY_BADGE_CLASS = {
  Low: "bg-gray-100 text-gray-700",
  Medium: "bg-[#0B2A4A] text-white",
  High: "bg-orange-100 text-orange-700",
  Critical: "bg-red-500 text-white",
};

const toDateValue = (value) => {
  if (!value) return 0;
  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }
  return new Date(value).getTime() || 0;
};

const timeAgo = (value) => {
  const ms = Date.now() - toDateValue(value);
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
};

export default function SuperAdminHelp() {
  const { user, profile, role } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [activeStatus, setActiveStatus] = useState("All");
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [remarks, setRemarks] = useState([]);
  const [loadingRemarks, setLoadingRemarks] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [addingRemark, setAddingRemark] = useState(false);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const rows = await getHelpTickets({ role: "superAdmin" });
      setTickets(rows || []);
    } catch (error) {
      console.error("Failed to load help tickets:", error);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const ticketCounts = useMemo(() => {
    const countByStatus = {
      Open: 0,
      "In Progress": 0,
      Resolved: 0,
    };

    tickets.forEach((ticket) => {
      const status = String(ticket.status || "Open");
      if (countByStatus[status] !== undefined) {
        countByStatus[status] += 1;
      }
    });

    return {
      total: tickets.length,
      open: countByStatus.Open,
      inProgress: countByStatus["In Progress"],
      resolved: countByStatus.Resolved,
    };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    if (activeStatus === "All") return tickets;
    return tickets.filter(
      (ticket) => String(ticket.status || "") === activeStatus,
    );
  }, [activeStatus, tickets]);

  const statusTabLabel = (status) => {
    if (status === "All") return `All (${tickets.length})`;
    const count = tickets.filter(
      (ticket) => String(ticket.status || "") === status,
    ).length;
    return `${status} (${count})`;
  };

  const openTicketModal = async (ticket) => {
    setSelectedTicket(ticket);
    setLoadingRemarks(true);
    try {
      const rows = await getHelpTicketRemarks(ticket.id);
      setRemarks(rows || []);
    } catch (error) {
      console.error("Failed to load ticket remarks:", error);
      setRemarks([]);
    } finally {
      setLoadingRemarks(false);
    }
  };

  const handleStatusChange = async (nextStatus) => {
    if (!selectedTicket || !nextStatus || nextStatus === selectedTicket.status)
      return;

    setStatusUpdating(true);
    try {
      await updateHelpTicketStatus({
        ticketId: selectedTicket.id,
        status: nextStatus,
        actor: {
          uid: user?.uid,
          name: profile?.name || user?.email || "Super Admin",
          role: role || "superAdmin",
        },
      });

      setSelectedTicket((prev) => ({ ...prev, status: nextStatus }));
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === selectedTicket.id
            ? { ...ticket, status: nextStatus }
            : ticket,
        ),
      );
    } catch (error) {
      console.error("Failed to update status:", error);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAddRemark = async (text) => {
    if (!selectedTicket || !text.trim()) return;

    setAddingRemark(true);
    try {
      await addHelpTicketRemark({
        ticketId: selectedTicket.id,
        text,
        author: {
          uid: user?.uid,
          name: profile?.name || user?.email || "Super Admin",
          role: role || "superAdmin",
        },
      });

      const rows = await getHelpTicketRemarks(selectedTicket.id);
      setRemarks(rows || []);
      await loadTickets();
    } catch (error) {
      console.error("Failed to add remark:", error);
    } finally {
      setAddingRemark(false);
    }
  };

  return (
    <SuperAdminLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-4xl font-semibold text-[#012920]">
            Help Tickets Portal
          </h1>
          <p className="mt-1 text-xl text-[#012920]">
            Manage all support tickets from users, HODs, and admins
          </p>
        </div>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<HelpCircle size={18} />}
            label="Total Tickets"
            value={ticketCounts.total}
            tone="blue"
          />
          <MetricCard
            icon={<AlertCircle size={18} />}
            label="Open"
            value={ticketCounts.open}
            tone="red"
          />
          <MetricCard
            icon={<Clock3 size={18} />}
            label="In Progress"
            value={ticketCounts.inProgress}
            tone="yellow"
          />
          <MetricCard
            icon={<CheckCircle2 size={18} />}
            label="Resolved"
            value={ticketCounts.resolved}
            tone="green"
          />
        </section>

        <section className="rounded-2xl border border-[#012920] bg-white p-4 shadow-sm">
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 md:grid-cols-8">
            {STATUS_TABS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setActiveStatus(status)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  activeStatus === status
                    ? "bg-white text-[#1b2a46] shadow"
                    : "text-[#6b7b90]"
                }`}
              >
                {statusTabLabel(status)}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[#7b8da6]">
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Priority</th>
                  <th className="px-3 py-3 font-semibold">Category</th>
                  <th className="px-3 py-3 font-semibold">Subject</th>
                  <th className="px-3 py-3 font-semibold">User</th>
                  <th className="px-3 py-3 font-semibold">College</th>
                  <th className="px-3 py-3 font-semibold">Created</th>
                  <th className="px-3 py-3 text-center font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-6 text-center text-gray-500"
                    >
                      Loading tickets...
                    </td>
                  </tr>
                ) : filteredTickets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-6 text-center text-gray-500"
                    >
                      No tickets found for selected status.
                    </td>
                  </tr>
                ) : (
                  filteredTickets.map((ticket) => (
                    <tr key={ticket.id} className="border-b last:border-b-0">
                      <td className="px-3 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[ticket.status] || "bg-gray-100 text-[#012920]"}`}
                        >
                          {ticket.status || "Open"}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${PRIORITY_BADGE_CLASS[ticket.priority] || "bg-gray-100 text-[#012920]"}`}
                        >
                          {ticket.priority || "Medium"}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                          {ticket.category || "General"}
                        </span>
                      </td>
                      <td className="px-3 py-4 font-medium text-[#273852]">
                        {ticket.subject || "-"}
                      </td>
                      <td className="px-3 py-4 text-[#3c4f69]">
                        {ticket.createdByName || "Unknown User"}
                      </td>
                      <td className="px-3 py-4 text-[#3c4f69]">
                        {ticket.collegeName || "-"}
                      </td>
                      <td className="px-3 py-4 text-[#3c4f69]">
                        {timeAgo(ticket.createdAt)}
                      </td>
                      <td className="px-3 py-4 text-center">
                        <TicketViewActionButton
                          onClick={() => openTicketModal(ticket)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          role={role || "superAdmin"}
          onClose={() => setSelectedTicket(null)}
          onStatusChange={handleStatusChange}
          statusUpdating={statusUpdating}
          remarks={remarks}
          loadingRemarks={loadingRemarks}
          onAddRemark={handleAddRemark}
          addingRemark={addingRemark}
        />
      )}
    </SuperAdminLayout>
  );
}

function MetricCard({ icon, label, value, tone }) {
  const toneClass =
    tone === "red"
      ? "bg-red-100 text-red-600"
      : tone === "yellow"
        ? "bg-yellow-100 text-yellow-600"
        : tone === "green"
          ? "bg-green-100 text-green-600"
          : "bg-blue-100 text-blue-600";

  return (
    <div className="rounded-2xl border border-[#012920] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`rounded-xl p-2 ${toneClass}`}>{icon}</span>
        <div>
          <p className="text-4xl font-semibold text-[#012920]">{value}</p>
          <p className="text-base text-[#012920]">{label}</p>
        </div>
      </div>
    </div>
  );
}
