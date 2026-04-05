/* ============================================
   Privacy Policy
   ============================================ */

export const metadata = { title: 'Privacy Policy - NexVid' };

const DISCORD_INVITE_URL = 'https://cloud.umami.is/q/vCu19Bcub';

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-[28px] font-bold text-text-primary tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-[13px] text-text-muted">Last updated: {new Date().toLocaleDateString()}</p>

      <div className="mt-8 space-y-6 text-text-secondary text-[13px] leading-relaxed">
        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">1. Overview</h2>
          <p>
            NexVid is designed to work primarily with data stored locally in your browser.
            If backend login/cloud sync is enabled for this deployment, selected account data is also processed
            by the configured backend API.
          </p>
        </section>

        <section className="mt-8">
          <p className="text-[13px] text-text-muted">
            © {new Date().getFullYear()} NexVid · All rights reserved.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">2. Data We Process</h2>
          <p>
            By default, data is stored in your browser&apos;s <code className="text-accent">localStorage</code>.
            If cloud auth is enabled, the backend stores only data necessary to run account, security, and moderation features.
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1 text-text-muted">
            <li>Account data: nickname, password hash, account creation date</li>
            <li>Session data: authentication tokens and token expiry data</li>
            <li>App data: settings, watchlist, playback-related preferences</li>
            <li>Security data: hashed anti-abuse identifiers (e.g. hashed IP/fingerprint signals)</li>
            <li>Moderation/admin data: bans, audit logs, security events, timestamps</li>
          </ul>
          <p className="mt-2">
            We do not require email verification to use accounts in the current deployment.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">3. Purposes and Legal Basis (GDPR)</h2>
          <p>
            We process data for: (a) account login/session handling, (b) app functionality and optional sync,
            and (c) security and abuse prevention.
          </p>
          <p className="mt-2">
            The legal basis is generally:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1 text-text-muted">
            <li><strong>Article 6(1)(b) GDPR</strong> (performance of a contract) for account/service operation</li>
            <li><strong>Article 6(1)(f) GDPR</strong> (legitimate interest) for security, anti-abuse and moderation</li>
          </ul>
          <p className="mt-2">
            Where local browser storage is strictly necessary for requested functionality, it is used on that basis.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">4. Third-Party Services</h2>
          <p>NexVid may connect to external services needed to render content and metadata:</p>
          <ul className="mt-2 list-disc list-inside space-y-1 text-text-muted">
            <li><strong>TMDB API</strong> &mdash; movie/show metadata, posters, and search data</li>
            <li><strong>OMDb API</strong> &mdash; external ratings and additional title metadata</li>
            <li><strong>FebBox</strong> &mdash; streaming source/provider integration used by resolver flows</li>
            <li><strong>TheIntroDB</strong> &mdash; optional intro/outro segment metadata (skip-intro/skip-outro features)</li>
            <li><strong>Wyzie Subs</strong> &mdash; Multi-language subtitles and translations.</li>
            <li><strong>Groq</strong> &mdash; inference platform used by the AI Assistant.</li>
          </ul>
          <p className="mt-2">
            These services operate under their own privacy policies and terms. We recommend reviewing
            the policies for TMDB, OMDb, FebBox, TheIntroDB, and Groq directly if you use features that rely on them.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">5. Cookies and Local Storage</h2>
          <p>
            NexVid uses only technically necessary client-side storage (primarily <code className="text-accent">localStorage</code>)
            and authentication/session mechanisms required to operate the service. We do not use advertising or tracking cookies.
          </p>
          <p className="mt-2">
            If non-essential analytics or marketing cookies are introduced in a future release,
            this policy and consent flow will be updated accordingly.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">6. Retention</h2>
          <p>
            We keep data only as long as needed for account operation, service reliability, and abuse prevention.
            Retention may vary by data type (e.g., session records vs. moderation logs) and may be adjusted
            where required by law or security obligations.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">7. Analytics</h2>
          <p>
            This deployment does not use behavioral advertising trackers.
            If operational telemetry is enabled by the infrastructure provider, it is used for reliability/security,
            not ad profiling.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">8. Your Rights (EU/EEA)</h2>
          <p>
            Subject to applicable law, you may request access, rectification, erasure, restriction, objection,
            and data portability where relevant. You may also object to processing based on legitimate interest.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">9. Your Control</h2>
          <p>
            You can delete all stored data at any time by clearing your browser&apos;s localStorage,
            or by using the &ldquo;Clear Everything&rdquo; option in the Settings page.
          </p>
          <p className="mt-2">
            For this deployment, data stored on our backend (Cloudflare D1) is deleted only when
            you use &ldquo;Clear Everything&rdquo; while logged into your account.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">10. Contact</h2>
          <p className="mb-2">
            For privacy requests related to this deployment (including account deletion, access requests, or security concerns),
            please contact our security team:
          </p>
          <a href="mailto:security@nexvid.online" className="text-accent hover:underline font-medium">security@nexvid.online</a>
          <p className="mt-4 mb-2">For general support and other inquiries:</p>
          <a href="mailto:support@nexvid.online" className="text-accent hover:underline font-medium">support@nexvid.online</a>
          <p className="mt-4 mb-2">Community and quick updates:</p>
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline font-medium"
          >
            Join Discord
          </a>
        </section>
      </div>
    </div>
  );
}
