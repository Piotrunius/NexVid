/* ============================================
   Terms of Service
   ============================================ */

export const metadata = { title: 'Terms of Service - NexVid' };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-[28px] font-bold text-text-primary tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-[13px] text-text-muted">Last updated: {new Date().toLocaleDateString()}</p>

      <div className="mt-8 space-y-6 text-text-secondary text-[13px] leading-relaxed">
        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">1. Acceptance</h2>
          <p>
            By accessing or using NexVid, you agree to these Terms of Service.
            If you do not agree, you may not use the application.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">2. Nature of Service</h2>
          <p>
            NexVid is a client-side media aggregation tool designed for personal use.
            It does not host, store, upload, or distribute any media content.
            NexVid acts as an interface that discovers and plays content from third-party sources.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">3. Accounts and Cloud Sync</h2>
          <p>
            NexVid can run in local-only mode. If a backend is configured and you sign in,
            account data, settings, and watchlist data may be synced with that backend.
            You are responsible for the backend you connect to and its policies.
          </p>
          <p className="mt-2">
            On this deployment, account authentication uses nickname and password. Email verification is not required.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">4. Anti-Abuse and Moderation</h2>
          <p>
            To protect service integrity, this deployment may enforce anti-abuse controls including one-account policy,
            rate limiting, and ban enforcement based on nickname and security identifiers (including IP/network signals).
          </p>
          <p className="mt-2">
            Accounts may be suspended or blocked where abuse, evasion, fraud, or repeated violations are detected.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">5. User Responsibility</h2>
          <p>
            You are solely responsible for how you use NexVid and for ensuring your use
            complies with all applicable laws in your jurisdiction. The developers of NexVid
            are not responsible for any content accessed through the application.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">6. No Warranty</h2>
          <p>
            NexVid is provided &ldquo;as is&rdquo; without any warranties of any kind, either express
            or implied. We do not guarantee the availability, accuracy, or reliability of any
            streaming sources or metadata.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">7. Limitation of Liability</h2>
          <p>
            In no event shall the developers of NexVid be liable for any indirect, incidental,
            special, consequential, or punitive damages arising from your use of the application.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">8. Modifications</h2>
          <p>
            We reserve the right to modify these terms at any time. Continued use of NexVid after
            changes constitutes acceptance of the modified terms.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">9. Intellectual Property and License</h2>
          <p>
            Created by Piotrunius · © {new Date().getFullYear()} NexVid · All rights reserved.
            All media content, metadata, and images are the property of their respective owners.
            TMDB branding is used under their API terms of use.
          </p>
        </section>
      </div>
    </div>
  );
}
