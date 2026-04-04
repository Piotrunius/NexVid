/* ============================================
   DMCA Notice
   ============================================ */

export const metadata = { title: 'DMCA - NexVid' };

const DISCORD_INVITE_URL = 'https://cloud.umami.is/q/vCu19Bcub';

export default function DmcaPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-[28px] font-bold text-text-primary tracking-tight">DMCA Notice</h1>
      <p className="mt-2 text-[13px] text-text-muted">Digital Millennium Copyright Act</p>

      <div className="mt-8 space-y-6 text-text-secondary text-[13px] leading-relaxed">
        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">Content Disclaimer</h2>
          <p>
            NexVid does not host, upload, store, or distribute any media content whatsoever.
            The application is an interface that references third-party sources through provider APIs.
            Stream delivery and availability are controlled by those providers, not by NexVid.
          </p>
        </section>
        <section className="mt-8">
          <p className="text-[13px] text-text-muted">
            © {new Date().getFullYear()} NexVid · All rights reserved.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">How It Works</h2>
          <ul className="list-disc list-inside space-y-2 text-text-muted">
            <li>NexVid can run fully in-browser with local storage</li>
            <li>Optional backend deployments may sync user settings/watchlist data</li>
            <li>Links and streams come from third-party providers</li>
            <li>Metadata and images come from TMDB&apos;s public API</li>
          </ul>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">Copyright Concerns</h2>
          <p>
            If you believe any third-party content accessible through NexVid infringes on your
            copyright, please direct your DMCA takedown request to the relevant hosting provider
            that actually serves the content. NexVid cannot remove content from external hosts.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">Fair Use</h2>
          <p>
            This application is provided for educational and personal use purposes.
            Users are responsible for complying with applicable copyright laws in their jurisdiction.
          </p>
        </section>

        <section className="pt-6 border-t border-[var(--border)]">
          <h2 className="text-[15px] font-semibold text-text-primary mb-2">Contact Information</h2>
          <p className="mb-2">For any legal or copyright-related inquiries, please contact our security team:</p>
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
