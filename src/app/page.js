import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-lg p-8 shadow-sm text-center space-y-6">
        {/* Badge */}
        <div className="badge badge-outline mx-auto">Internal MVP</div>

        {/* Title */}
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          TaskWhisker
        </h1>

        {/* Subtitle */}
        <p className="text-zinc-600 leading-relaxed">
          Internal operations dashboard for pet-sitting.
        </p>

        {/* Divider */}
        <div className="divider"></div>

        {/* Status */}
        <p className="text-sm text-zinc-500">
          Phase 1 in progress. Not a public product.
        </p>

        {/* Buttons */}
        <div className="flex justify-center gap-3">
          <button className="btn btn-primary btn-sm">Operator Login</button>
          <button className="btn btn-ghost btn-sm">Sitter Access</button>
        </div>
      </div>
    </div>
  );
}
