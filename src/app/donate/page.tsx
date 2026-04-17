/* ============================================
   Donate – Crypto Wallets
   ============================================ */

"use client";

import { toast } from "@/components/ui/Toaster";
import Image from "next/image";
import { useState } from "react";

/* ── wallet data ── */
const WALLETS = [
  {
    id: "btc",
    name: "Bitcoin",
    ticker: "BTC",
    address: "bc1q2nztgkn59wrla56eestty9m7rdgpv7tp8ugpzt",
    network: "Bitcoin · Native SegWit",
    color: "#F7931A",
    icon: "/Bitcoin.svg",
  },
  {
    id: "eth",
    name: "Ethereum",
    ticker: "ETH",
    address: "0xb7322E9868285A940afebf47E1a2BC37CEE538C2",
    network: "Ethereum Mainnet",
    color: "#627EEA",
    icon: "/Ethereum.svg",
  },
  {
    id: "sol",
    name: "Solana",
    ticker: "SOL",
    address: "4VhdmrPjYtTuN3iVuWMKC1YjDHDfwQrbSuSPMinJSGf9",
    network: "Solana Mainnet",
    color: "#DC1FFF",
    icon: "/Solana.svg",
  },
  {
    id: "ltc",
    name: "Litecoin",
    ticker: "LTC",
    address: "ltc1qecy763qgcj563j0ty5pphqwkvj5k6txy3c9wkh",
    network: "Litecoin · Native SegWit",
    color: "#345D9D",
    icon: "/Litecoin.svg",
  },
];

const GROUPS = [
  {
    title: "Bitcoin & Ethereum",
    description: "The original digital gold and the engine of Web3",
    wallets: ["btc", "eth"],
  },
  {
    title: "Solana & Litecoin",
    description: "Lightning-fast transactions with minimal fees",
    wallets: ["sol", "ltc"],
  },
];

export default function DonatePage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const copyAddress = async (id: string, address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedId(id);
      toast("Address copied to clipboard!", "success");
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      toast("Failed to copy address", "error");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden pt-24 pb-16">

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* ── Hero Section ── */}
        <header className="text-center mb-14">
          {/* Heart container */}
          <div className="inline-flex items-center justify-center mb-5">
            <svg
              width="42"
              height="42"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: "drop-shadow(0 0 12px var(--accent-glow))" }}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>

          <h1 className="text-[34px] sm:text-[42px] font-bold text-text-primary tracking-tight leading-tight">
            Support NexVid
          </h1>
          <p className="mt-3 text-[15px] text-text-secondary leading-relaxed max-w-lg mx-auto">
            NexVid is free and open for everyone. Your donation helps us
            keep the servers running and build new features.
          </p>
        </header>

        {/* ── Wallet Groups ── */}
        <div className="space-y-8">
          {GROUPS.map((group, groupIdx) => (
            <section
              key={group.title}
              className=""
            >
              {/* Group Header */}
              <div className="flex items-center gap-3 mb-4 px-1">
                <div className="w-1 h-5 rounded-full bg-gradient-to-b from-[var(--accent)] to-transparent" />
                <div>
                  <h2 className="text-[16px] font-bold text-text-primary tracking-tight">
                    {group.title}
                  </h2>
                  <p className="text-[12px] text-text-muted mt-0.5">
                    {group.description}
                  </p>
                </div>
              </div>

              {/* Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {group.wallets.map((walletId) => {
                  const wallet = WALLETS.find((w) => w.id === walletId)!;
                  const isCopied = copiedId === wallet.id;
                  const isHovered = hoveredId === wallet.id;

                  return (
                    <div
                      key={wallet.id}
                      id={`donate-${wallet.id}`}
                      className="group relative rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5 transition-all duration-300 hover:bg-white/[0.06] hover:border-white/[0.12] hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
                      onMouseEnter={() => setHoveredId(wallet.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        boxShadow: isHovered
                          ? `0 0 40px ${wallet.color}10, 0 8px 32px rgba(0,0,0,0.5)`
                          : undefined,
                      }}
                    >
                      {/* Subtle colored top line */}
                      <div
                        className="absolute top-0 left-6 right-6 h-[1px] rounded-full transition-opacity duration-300"
                        style={{
                          background: `linear-gradient(90deg, transparent, ${wallet.color}40, transparent)`,
                          opacity: isHovered ? 1 : 0,
                        }}
                      />

                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                            style={{
                              background: `${wallet.color}15`,
                              border: `1px solid ${wallet.color}25`,
                            }}
                          >
                            <Image
                              src={wallet.icon}
                              alt={wallet.name}
                              width={32}
                              height={32}
                              className="w-8 h-8"
                            />
                          </div>
                          <div>
                            <h3 className="text-[15px] font-semibold text-text-primary">
                              {wallet.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span
                                className="text-[11px] font-bold tracking-wide"
                                style={{ color: wallet.color }}
                              >
                                {wallet.ticker}
                              </span>
                              <span className="text-[10px] text-text-muted">
                                •
                              </span>
                              <span className="text-[10px] text-text-muted">
                                {wallet.network}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Address */}
                      <div className="flex items-stretch gap-2">
                        <div className="flex-1 min-w-0 rounded-xl bg-black/40 border border-white/[0.06] px-4 py-3 flex items-center">
                          <code className="text-[12px] sm:text-[13px] text-text-secondary font-mono truncate select-all">
                            {wallet.address}
                          </code>
                        </div>
                        <button
                          onClick={() =>
                            copyAddress(wallet.id, wallet.address)
                          }
                          className="shrink-0 flex items-center justify-center gap-1.5 rounded-xl px-4 text-[12px] font-semibold transition-all duration-200 active:scale-95"
                          style={{
                            background: isCopied
                              ? `${wallet.color}20`
                              : "rgba(255,255,255,0.06)",
                            border: `1px solid ${isCopied ? `${wallet.color}40` : "rgba(255,255,255,0.08)"}`,
                            color: isCopied ? wallet.color : "var(--text-secondary)",
                          }}
                        >
                          {isCopied ? (
                            <>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                              >
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                              <span className="hidden sm:inline">Copied!</span>
                            </>
                          ) : (
                            <>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <rect
                                  x="9"
                                  y="9"
                                  width="13"
                                  height="13"
                                  rx="2"
                                  ry="2"
                                />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              <span className="hidden sm:inline">Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* ── Bottom CTA / Note ── */}
        <div className="mt-14 text-center">
          <div
            className="inline-flex items-center gap-3 rounded-2xl px-6 py-4 border border-white/[0.06] bg-white/[0.02]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <p className="text-[13px] text-text-muted leading-relaxed text-left">
              Always double-check the wallet address before sending.
              Crypto transactions are{" "}
              <span className="text-text-secondary font-medium">
                irreversible
              </span>
              . Thank you for your generosity!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
