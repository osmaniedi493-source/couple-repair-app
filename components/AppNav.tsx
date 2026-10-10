"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/timeline", label: "记录" },
  { href: "/review", label: "双人复盘" },
  { href: "/patterns", label: "模式分析" },
  { href: "/forgive", label: "原谅我吧" }
];

export default function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex w-fit flex-wrap gap-1 rounded-full border-2 border-ink bg-white p-1.5 shadow-sticker">
      {tabs.map((tab) => {
        const active = pathname === tab.href || (tab.href !== "/timeline" && pathname.startsWith(tab.href));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-3 py-1.5 text-sm font-black transition ${
              active ? "bg-ink text-white" : "text-slate-500"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
