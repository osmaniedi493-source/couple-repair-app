import Link from "next/link";

export default function FloatingNewButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="fixed bottom-6 right-6 grid h-14 w-14 place-items-center rounded-full border-[3px] border-ink bg-ink text-2xl font-black text-white shadow-sticker"
      aria-label="新建"
    >
      +
    </Link>
  );
}
