"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchDispatches } from "@/lib/api";
import { DispatchList } from "@/components/dispatch-list";
import { Button } from "@/components/ui/button";
import type { Dispatch } from "@agentfleet/types";

const PAGE_SIZE = 25;

export default function DispatchesPage() {
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchDispatches({
        status: statusFilter === "all" ? undefined : statusFilter,
        source: sourceFilter === "all" ? undefined : sourceFilter,
        limit: PAGE_SIZE,
        offset,
      });
      setDispatches(result.dispatches);
      setTotal(result.total);
    } catch (err) {
      console.error("Failed to load dispatches:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sourceFilter, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      {/* Page header */}
      <div className="flex justify-between items-center" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Dispatch History
        </h1>
        <span style={{ fontSize: 13, color: "var(--af-text-secondary)" }}>
          {total} total
        </span>
      </div>

      {/* Toolbar / Filters */}
      <div className="flex items-center" style={{ gap: 12, marginBottom: 24 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)" }}>
          Status:
        </span>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setOffset(0);
          }}
        >
          <option value="all">All</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="dispatched">Dispatched</option>
        </select>

        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--af-text-secondary)", marginLeft: 8 }}>
          Source:
        </span>
        <select
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value);
            setOffset(0);
          }}
        >
          <option value="all">All</option>
          <option value="manual">Manual</option>
          <option value="linear">Linear</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ color: "var(--af-text-tertiary)", fontSize: 13 }}>
          Loading dispatches...
        </div>
      ) : (
        <DispatchList dispatches={dispatches} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between" style={{ marginTop: 24 }}>
          <p style={{ fontSize: 13, color: "var(--af-text-secondary)" }}>
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
