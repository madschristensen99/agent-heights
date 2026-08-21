import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { DollarSign, Users, Activity, TrendingUp, Zap, RefreshCw, TrendingDown, Wallet } from "lucide-react";
import { IconArrowRight } from "./Icons";
import { adminApi } from "../lib/admin-api";
import type {
  OverviewStats, UserTimeseries, RevenueData, UsageStats,
  ConversionFunnel, SubscriptionRow, RealtimeStats, EngagementStats,
  FinancialMetrics,
} from "../lib/admin-api";

const CHART_COLORS = ["#58c866", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtDate(s: string): string {
  return s.slice(5); // MM-DD
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function KPICard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 text-muted mb-2">
        <Icon size={16} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "#1a1d2e",
  border: "1px solid #2a2d3e",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#e0e0e0",
};

export function PlatformStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [users, setUsers] = useState<UserTimeseries | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [conversion, setConversion] = useState<ConversionFunnel | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [realtime, setRealtime] = useState<RealtimeStats | null>(null);
  const [engagement, setEngagement] = useState<EngagementStats | null>(null);
  const [financials, setFinancials] = useState<FinancialMetrics | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setError(null);
      const [ov, us, rev, usg, conv, subs, rt, eng, fin] = await Promise.all([
        adminApi.overview(),
        adminApi.users(30),
        adminApi.revenue(12),
        adminApi.usage(30),
        adminApi.conversion(),
        adminApi.subscriptions(),
        adminApi.realtime(),
        adminApi.engagement(),
        adminApi.financials(30),
      ]);
      setOverview(ov);
      setUsers(us);
      setRevenue(rev);
      setUsage(usg);
      setConversion(conv);
      setSubscriptions(subs);
      setRealtime(rt);
      setEngagement(eng);
      setFinancials(fin);
    } catch (err: any) {
      setError(err.message ?? "Failed to load stats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Auto-refresh realtime stats every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      adminApi.realtime().then(setRealtime).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadAll();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted text-sm">Loading platform stats...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <p className="text-status-error text-sm mb-2">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-accent text-bg rounded-lg text-sm hover:opacity-80 transition-opacity"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const dauData = users?.dau.map(d => ({ date: fmtDate(d.date), users: d.value })) ?? [];
  const signupData = users?.newSignups.map(d => ({ date: fmtDate(d.date), signups: d.value })) ?? [];
  const spendData = usage?.dailySpend.map(d => ({ date: fmtDate(d.date), spend: Number(d.value.toFixed(2)) })) ?? [];
  const callsData = usage?.dailyCalls.map(d => ({ date: fmtDate(d.date), calls: d.value })) ?? [];
  const tokenData = usage?.dailyTokens.map(d => ({
    date: fmtDate(d.date),
    input: d.inputTokens,
    output: d.outputTokens,
  })) ?? [];
  const revenueHistory = revenue?.history.map(h => ({ month: h.month, mrr: Number(h.mrr.toFixed(2)) })) ?? [];
  const tierData = revenue?.byTier.map(t => ({ name: t.tier, value: t.mrr })) ?? [];
  const modelData = usage?.byModel.slice(0, 8).map(m => ({ name: m.model.replace(/-\d{8}$/, "").replace(/^claude-sonnet-4$/, "claude-sonnet"), spend: Number(m.spend.toFixed(2)), calls: m.calls })) ?? [];
  const funnelData = conversion ? [
    { stage: "Registered", value: conversion.totalUsers, fill: CHART_COLORS[0] },
    { stage: "Entrance Paid", value: conversion.entrancePaid, fill: CHART_COLORS[1] },
    { stage: "Subscribed", value: conversion.subscribed, fill: CHART_COLORS[2] },
  ] : [];
  const tierDistData = conversion?.tierDistribution.map(t => ({ name: t.tier, value: t.count })) ?? [];
  const agentStatusData = realtime?.agentsByStatus.map(s => ({ name: s.status, value: s.count })) ?? [];
  const pnlData = financials?.dailyPnl.map(d => ({ date: fmtDate(d.date), pnl: Number(d.pnl.toFixed(2)), revenue: Number(d.revenue.toFixed(2)), spend: Number(d.spend.toFixed(2)) })) ?? [];

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Platform Statistics</h1>
          <p className="text-xs text-muted mt-0.5">Operational metrics and revenue overview</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-sm text-muted hover:text-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard icon={DollarSign} label="MRR" value={fmtMoney(overview?.mrr ?? 0)} sub={`ARR ${fmtMoney(overview?.arr ?? 0)}`} />
        <KPICard icon={Users} label="Total Users" value={fmtNum(overview?.totalUsers ?? 0)} sub={`${overview?.activeSubscribers ?? 0} subscribers`} />
        <KPICard icon={Activity} label="DAU" value={fmtNum(overview?.dau ?? 0)} sub={`WAU ${fmtNum(overview?.wau ?? 0)} · MAU ${fmtNum(overview?.mau ?? 0)}`} />
        <KPICard icon={Zap} label="LLM Spend (30d)" value={fmtMoney(overview?.totalLlmSpend ?? 0)} sub={`Margin ${fmtPct(overview?.grossMarginPct ?? 0)}`} />
        <KPICard icon={TrendingUp} label="ARPU" value={fmtMoney(overview?.arpu ?? 0)} sub={`$${(overview?.grossMargin ?? 0).toFixed(2)} gross margin`} />
        <KPICard icon={Users} label="Online Now" value={fmtNum(overview?.concurrentUsers ?? 0)} sub={`${overview?.concurrentAgents ?? 0} agents active`} />
      </div>

      {/* Financial KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard icon={DollarSign} label="Revenue (30d)" value={fmtMoney(financials?.totalRevenue ?? 0)} sub={`MRR ${fmtMoney(financials?.mrr ?? 0)}`} />
        <KPICard icon={Wallet} label="Gross Profit" value={fmtMoney(financials?.grossProfit ?? 0)} sub={`Margin ${fmtPct(financials?.grossMarginPct ?? 0)}`} />
        <KPICard icon={TrendingUp} label="EBITDA" value={fmtMoney(financials?.ebitda ?? 0)} sub={`Margin ${fmtPct(financials?.ebitdaMarginPct ?? 0)}`} />
        <KPICard icon={DollarSign} label="Net Profit" value={fmtMoney(financials?.netProfit ?? 0)} sub="No debt/taxes" />
        <KPICard icon={Wallet} label="Fixed Costs" value={fmtMoney(financials?.fixedCosts ?? 0)} sub="$5/mo Railway" />
        <KPICard icon={TrendingDown} label="Burn Rate" value={fmtMoney(financials?.burnRate ?? 0)} sub={financials && financials.ebitda >= 0 ? "Profitable" : "Monthly burn"} />
      </div>

      {/* P&L Table + Daily P&L Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Profit & Loss Summary (30d)">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">MRR (monthly)</span><span className="text-text font-semibold">{fmtMoney(financials?.mrr ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">One-time Revenue</span><span className="text-text">{fmtMoney(financials?.oneTimeRevenue ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Total Revenue (period)</span><span className="text-text font-semibold">{fmtMoney(financials?.totalRevenue ?? 0)}</span></div>
            <div className="flex justify-between border-t border-border pt-2"><span className="text-muted">LLM Inference Spend</span><span className="text-status-error">{fmtMoney(financials?.llmSpend ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Gross Profit</span><span className="text-text font-semibold">{fmtMoney(financials?.grossProfit ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Gross Margin</span><span className="text-text">{fmtPct(financials?.grossMarginPct ?? 0)}</span></div>
            <div className="flex justify-between border-t border-border pt-2"><span className="text-muted">Fixed Costs (Railway)</span><span className="text-status-error">{fmtMoney(financials?.fixedCosts ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">EBITDA</span><span className={`font-bold ${(financials?.ebitda ?? 0) >= 0 ? "text-accent" : "text-status-error"}`}>{fmtMoney(financials?.ebitda ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">EBITDA Margin</span><span className="text-text">{fmtPct(financials?.ebitdaMarginPct ?? 0)}</span></div>
            <div className="flex justify-between border-t border-border pt-2"><span className="text-muted">Net Profit</span><span className={`font-bold ${(financials?.netProfit ?? 0) >= 0 ? "text-accent" : "text-status-error"}`}>{fmtMoney(financials?.netProfit ?? 0)}</span></div>
            {financials && financials.burnRate > 0 && (
              <div className="flex justify-between"><span className="text-muted">Burn Rate</span><span className="text-status-error">{fmtMoney(financials.burnRate)}/mo</span></div>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Daily P&L (30d)">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={pnlData}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#58c866" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#58c866" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={fmtMoney} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `$${v.toFixed(2)}`} />
              <Area type="monotone" dataKey="pnl" stroke="#58c866" fill="url(#pnlGrad)" strokeWidth={2} name="P&L" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 1: DAU + Signups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Daily Active Users (30d)">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dauData}>
              <defs>
                <linearGradient id="dauGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#58c866" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#58c866" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="users" stroke="#58c866" fill="url(#dauGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="New Signups (30d)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={signupData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="signups" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2: Revenue + Spend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Revenue History (12 months)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenueHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={fmtMoney} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `$${v.toFixed(2)}`} />
              <Bar dataKey="mrr" fill="#58c866" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Daily LLM Spend (30d)">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={spendData}>
              <defs>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={fmtMoney} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `$${v.toFixed(2)}`} />
              <Area type="monotone" dataKey="spend" stroke="#f59e0b" fill="url(#spendGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 3: Conversion funnel + Tier distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Conversion Funnel">
          <div className="space-y-3">
            {funnelData.map((stage, i) => {
              const pct = conversion && conversion.totalUsers > 0
                ? (stage.value / conversion.totalUsers) * 100
                : 0;
              return (
                <div key={stage.stage}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text">{stage.stage}</span>
                    <span className="text-muted">{fmtNum(stage.value)} ({fmtPct(pct)})</span>
                  </div>
                  <div className="h-6 bg-bg-hover rounded-md overflow-hidden">
                    <div
                      className="h-full rounded-md transition-all"
                      style={{ width: `${pct}%`, backgroundColor: stage.fill }}
                    />
                  </div>
                </div>
              );
            })}
            {conversion && (
              <div className="pt-2 border-t border-border text-xs text-muted space-y-1">
                <div>Entrance <IconArrowRight size={10} className="inline-block" /> Subscription: <span className="text-text">{fmtPct(conversion.subscriptionConversionPct)}</span></div>
                <div>Overall (Registered <IconArrowRight size={10} className="inline-block" /> Subscribed): <span className="text-text">{fmtPct(conversion.overallConversionPct)}</span></div>
              </div>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Tier Distribution">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={tierDistData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(e: any) => `${e.name}: ${e.value}`}
                labelLine={false}
              >
                {tierDistData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 4: API calls + Tokens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Daily API Calls (30d)">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={callsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="calls" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Daily Token Usage (30d)">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={tokenData}>
              <defs>
                <linearGradient id="inputGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="outputGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ec4899" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={fmtNum} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtNum(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="input" stroke="#3b82f6" fill="url(#inputGrad)" strokeWidth={1.5} name="Input" />
              <Area type="monotone" dataKey="output" stroke="#ec4899" fill="url(#outputGrad)" strokeWidth={1.5} name="Output" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 5: Spend by model + Realtime agent status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Spend by Model (30d)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={modelData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
              <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={fmtMoney} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} width={120} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `$${v.toFixed(2)}`} />
              <Bar dataKey="spend" fill="#58c866" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Agent Status (Live)">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-bg-hover rounded-lg p-3">
                <div className="text-xs text-muted">Online Users</div>
                <div className="text-xl font-bold text-accent">{realtime?.onlineUsers ?? 0}</div>
              </div>
              <div className="bg-bg-hover rounded-lg p-3">
                <div className="text-xs text-muted">Active Agents</div>
                <div className="text-xl font-bold text-accent">{realtime?.activeAgents ?? 0}</div>
              </div>
            </div>
            {agentStatusData.length > 0 && (
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={agentStatusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={55}
                    label={(e: any) => `${e.name}: ${e.value}`}
                    labelLine={false}
                  >
                    {agentStatusData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>

      {/* Revenue breakdown + Engagement */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Revenue Breakdown">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">MRR</span><span className="text-text font-semibold">{fmtMoney(revenue?.mrr ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">One-time Revenue</span><span className="text-text">{fmtMoney(revenue?.oneTimeRevenue ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Entrance Fees</span><span className="text-text">{revenue?.entranceFeesCount ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-muted">Asset Upgrades</span><span className="text-text">{revenue?.assetUpgradesCount ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-muted">Churned MRR</span><span className="text-status-error">{fmtMoney(revenue?.churnedMrr ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Past-due Subs</span><span className="text-status-error">{revenue?.pastDueCount ?? 0} ({fmtMoney(revenue?.pastDueMrr ?? 0)})</span></div>
            <div className="flex justify-between border-t border-border pt-2"><span className="text-muted">ARPU</span><span className="text-accent font-semibold">{fmtMoney(revenue?.arpu ?? 0)}</span></div>
          </div>
        </ChartCard>

        <ChartCard title="Engagement">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">Asset Upgrades</span><span className="text-text">{engagement?.assetUpgrades ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-muted">Marketplace Agents</span><span className="text-text">{engagement?.marketplaceAgents ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-muted">Organizations</span><span className="text-text">{engagement?.organizations ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-muted">Scheduled Tasks</span><span className="text-text">{engagement?.scheduledTasks ?? 0}</span></div>
          </div>
        </ChartCard>

        <ChartCard title="Usage Summary">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">Total Spend (30d)</span><span className="text-text font-semibold">{fmtMoney(usage?.totalSpend ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Cost / Active User</span><span className="text-text">{fmtMoney(usage?.costPerActiveUser ?? 0)}</span></div>
            {usage?.byProvider.map(p => (
              <div key={p.provider} className="flex justify-between">
                <span className="text-muted">{p.provider}</span>
                <span className="text-text">{fmtMoney(p.spend)} ({p.calls} calls)</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Subscriptions table */}
      <ChartCard title={`Active Subscriptions (${subscriptions.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-border">
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">Tier</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">Period End</th>
                <th className="pb-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.length === 0 ? (
                <tr><td colSpan={5} className="py-4 text-center text-muted">No subscriptions</td></tr>
              ) : (
                subscriptions.slice(0, 50).map((sub, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-bg-hover/50">
                    <td className="py-2 pr-4 text-text">{sub.email}</td>
                    <td className="py-2 pr-4">
                      <span className="px-2 py-0.5 rounded text-xs bg-bg-hover text-accent capitalize">{sub.tier}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs ${sub.status === "active" ? "text-accent" : sub.status === "past_due" ? "text-status-error" : "text-muted"}`}>
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-muted text-xs">
                      {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd * 1000).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 text-muted text-xs">
                      {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
