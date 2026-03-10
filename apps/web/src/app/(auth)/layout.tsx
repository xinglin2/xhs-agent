export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-xhs-pink via-white to-white flex flex-col items-center justify-center p-4">
      {/* Logo area */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-xhs-red rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xhs">
          <span className="text-white text-3xl font-bold">小</span>
        </div>
        <h1 className="text-2xl font-bold text-xhs-dark tracking-tight">XHS Agent</h1>
        <p className="text-sm text-xhs-muted mt-1">为海外创作者打造的小红书内容助手</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md">
        <div className="card-xhs p-6 shadow-lg">
          {children}
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        © 2024 XHS Agent · 专为海外创作者设计
      </p>
    </div>
  );
}
