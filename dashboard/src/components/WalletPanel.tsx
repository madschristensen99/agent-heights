import { useEffect } from "react";
import { useDashboard } from "../lib/store";
import { Wallet, RefreshCw, ArrowLeft, ExternalLink, Shield, History } from "lucide-react";

interface WalletPanelProps {
  agentId: string;
  onBack: () => void;
}

export function WalletPanel({ agentId, onBack }: WalletPanelProps) {
  const { agents, walletData, send } = useDashboard();
  const agent = agents.get(agentId);
  const data = walletData.get(agentId);

  useEffect(() => {
    if (agent?.cdpSolana) {
      send({ type: "get_cdp_wallet", agentId });
      send({ type: "get_cdp_policy", agentId });
      send({ type: "get_cdp_tx_history", agentId });
    }
    if (agent?.crossmintWallet) {
      send({ type: "get_crossmint_wallet", agentId });
      send({ type: "get_crossmint_balance", agentId });
      send({ type: "get_crossmint_policy", agentId });
      send({ type: "get_crossmint_tx_history", agentId });
    }
  }, [agentId, agent?.cdpSolana, agent?.crossmintWallet, send]);

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <p>Agent not found</p>
      </div>
    );
  }

  const hasCdp = agent.cdpSolana;
  const hasCrossmint = agent.crossmintWallet;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-bg-hover text-muted hover:text-gray-200">
          <ArrowLeft size={18} />
        </button>
        <Wallet size={20} className="text-muted" />
        <h2 className="text-lg font-semibold text-gray-200">{agent.name} — Wallets</h2>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 space-y-6 max-w-3xl">
        {!hasCdp && !hasCrossmint && (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <Wallet size={48} className="mb-4 opacity-50" />
            <p>No wallets provisioned for this agent</p>
          </div>
        )}

        {hasCdp && (
          <WalletSection
            title="CDP Solana Wallet"
            icon="◎"
            color="text-purple-400"
            walletData={data?.cdp_wallet_status as Record<string, unknown> | undefined}
            policyData={data?.cdp_policy_status as Record<string, unknown> | undefined}
            txData={data?.cdp_tx_history as Record<string, unknown> | undefined}
            onRefresh={() => {
              send({ type: "get_cdp_wallet", agentId });
              send({ type: "get_cdp_policy", agentId });
              send({ type: "get_cdp_tx_history", agentId });
            }}
            onOnramp={() => send({ type: "create_cdp_onramp", agentId })}
          />
        )}

        {hasCrossmint && (
          <WalletSection
            title="Crossmint Smart Wallet"
            icon="✦"
            color="text-blue-400"
            walletData={data?.crossmint_wallet_status as Record<string, unknown> | undefined}
            policyData={data?.crossmint_policy_status as Record<string, unknown> | undefined}
            txData={data?.crossmint_tx_history as Record<string, unknown> | undefined}
            onRefresh={() => {
              send({ type: "get_crossmint_wallet", agentId });
              send({ type: "get_crossmint_balance", agentId });
              send({ type: "get_crossmint_policy", agentId });
              send({ type: "get_crossmint_tx_history", agentId });
            }}
            onOnramp={() => send({ type: "create_crossmint_onramp", agentId })}
            onFund={() => send({ type: "fund_crossmint_wallet", agentId })}
          />
        )}
      </div>
    </div>
  );
}

interface WalletSectionProps {
  title: string;
  icon: string;
  color: string;
  walletData?: Record<string, unknown>;
  policyData?: Record<string, unknown>;
  txData?: Record<string, unknown>;
  onRefresh: () => void;
  onOnramp: () => void;
  onFund?: () => void;
}

function WalletSection({ title, icon, color, walletData, policyData, txData, onRefresh, onOnramp, onFund }: WalletSectionProps) {
  const address = walletData?.address as string | null | undefined;
  const balances = walletData?.balances as { symbol: string; amount: string; usdValue?: string }[] | null | undefined;
  const error = walletData?.error as string | undefined;
  const transactions = txData?.transactions as unknown[] | null | undefined;

  return (
    <div className="bg-bg-card border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className={`text-2xl ${color}`}>{icon}</span>
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        <div className="flex-1" />
        <button onClick={onRefresh} className="p-2 rounded-lg hover:bg-bg-hover text-muted hover:text-accent">
          <RefreshCw size={14} />
        </button>
      </div>

      {error && (
        <div className="text-xs text-status-error bg-status-error/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {address && (
        <div>
          <label className="text-xs text-muted block mb-1">Address</label>
          <div className="flex items-center gap-2">
            <code className="text-xs text-gray-300 font-mono bg-bg-input px-3 py-1.5 rounded-lg flex-1 truncate">{address}</code>
          </div>
        </div>
      )}

      {balances && balances.length > 0 && (
        <div>
          <label className="text-xs text-muted block mb-2">Balances</label>
          <div className="space-y-1">
            {balances.map((b, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{b.amount} {b.symbol}</span>
                {b.usdValue && <span className="text-muted text-xs">${b.usdValue}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {policyData && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Shield size={14} className="text-muted" />
            <label className="text-xs text-muted">Policy</label>
          </div>
          <div className="space-y-1 text-xs">
            {policyData.maxSolPerTransfer != null && (
              <div className="flex justify-between">
                <span className="text-muted">Max SOL / transfer</span>
                <span className="text-gray-300">{String(policyData.maxSolPerTransfer)}</span>
              </div>
            )}
            {policyData.spendingLimitUsd != null && (
              <div className="flex justify-between">
                <span className="text-muted">Spending limit (USD)</span>
                <span className="text-gray-300">${String(policyData.spendingLimitUsd)}</span>
              </div>
            )}
            {policyData.network && (
              <div className="flex justify-between">
                <span className="text-muted">Network</span>
                <span className="text-gray-300">{String(policyData.network)}</span>
              </div>
            )}
            {policyData.chain && (
              <div className="flex justify-between">
                <span className="text-muted">Chain</span>
                <span className="text-gray-300">{String(policyData.chain)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {transactions && transactions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <History size={14} className="text-muted" />
            <label className="text-xs text-muted">Recent Transactions ({transactions.length})</label>
          </div>
          <div className="space-y-1 max-h-48 overflow-auto">
            {transactions.slice(0, 10).map((tx, i) => {
              const t = tx as Record<string, unknown>;
              return (
                <div key={i} className="text-xs text-gray-400 bg-bg-input rounded px-2 py-1.5 truncate">
                  {t.signature ? String(t.signature).slice(0, 20) + "..." : t.memo ? String(t.memo) : `TX ${i + 1}`}
                  {t.err != null && <span className={t.err ? "text-status-error" : "text-status-done"}> {t.err ? "✗" : "✓"}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={onOnramp}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-xs text-gray-300 hover:border-accent"
        >
          <ExternalLink size={12} /> Onramp
        </button>
        {onFund && (
          <button
            onClick={onFund}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-xs text-gray-300 hover:border-accent"
          >
            Fund
          </button>
        )}
      </div>
    </div>
  );
}
