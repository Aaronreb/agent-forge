import Link from "next/link";

export default function Nav() {
  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
      <Link href="/" className="text-indigo-400 font-bold text-lg tracking-tight">
        Agent Forge
      </Link>
      <Link href="/agents" className="text-gray-300 hover:text-white text-sm transition">
        Agents
      </Link>
      <Link href="/workflows" className="text-gray-300 hover:text-white text-sm transition">
        Workflows
      </Link>
      <Link href="/monitor" className="text-gray-300 hover:text-white text-sm transition">
        Monitor
      </Link>
    </nav>
  );
}
