import { LegalPage, Section } from "../components/LegalPage";

export function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      eyebrow="Baindar legal"
      updatedAt="Last updated: May 16, 2026"
      summary="This policy explains what Baindar collects, how we use it, and the choices you have when you use the document binder, reader, AI, billing, web, mobile, and desktop experiences."
    >
      <Section title="1. Scope">
        <p>
          This Privacy Policy applies to Baindar, Inc. ("Baindar", "we", "us", or "our") and to the
          websites, apps, APIs, and related services that link to this policy (the "Service"). It
          does not apply to third-party websites, stores, payment portals, identity providers, or AI
          providers that have their own privacy policies.
        </p>
      </Section>

      <Section title="2. Information we collect">
        <p>We collect information in the following categories.</p>
        <ul>
          <li>
            <strong>Account information:</strong> name, email address, profile image, sign-in
            method, email verification state, and account timestamps.
          </li>
          <li>
            <strong>Authentication and session information:</strong> session tokens, OAuth account
            identifiers, limited OAuth token data, IP address, user agent, verification codes, and
            session expiration data.
          </li>
          <li>
            <strong>User content:</strong> documents you upload, original filenames, file type, file
            size, content hashes, extracted text, rendered sections, document metadata, cover
            images, assets, summaries, conversations, prompts, AI outputs, highlights, text
            snippets, notes, shelves, reading progress, and document sensitivity flags.
          </li>
          <li>
            <strong>Preferences:</strong> reading theme, reading font, default highlight color, AI
            settings, and notification preferences.
          </li>
          <li>
            <strong>Billing and usage information:</strong> plan, subscription status, billing
            provider customer and subscription identifiers, checkout and portal activity, AI usage
            counts, token counts, approximate cost records, and monthly usage periods. We do not
            store full payment card numbers.
          </li>
          <li>
            <strong>Device, app, and operations information:</strong> logs, error diagnostics,
            request metadata, browser or app information, and security events.
          </li>
        </ul>
      </Section>

      <Section title="3. Sources of information">
        <p>
          We collect information directly from you when you create an account, upload documents,
          write notes, create highlights, ask questions, change settings, or subscribe to a plan. We
          may also receive information from sign-in providers such as Google or Apple, payment and
          subscription providers such as Polar, email delivery infrastructure, Cloudflare services,
          AI providers, app platforms, and other service providers that help us operate Baindar.
        </p>
      </Section>

      <Section title="4. How we use information">
        <p>We use information to:</p>
        <ul>
          <li>provide, secure, maintain, and improve the Service;</li>
          <li>create accounts, authenticate sessions, and prevent abuse;</li>
          <li>store, parse, render, index, search, summarize, and delete documents;</li>
          <li>save highlights, notes, shelves, reading progress, and preferences;</li>
          <li>answer questions, generate summaries, and provide grounded AI features;</li>
          <li>meter usage, enforce plan limits, process subscriptions, and support billing;</li>
          <li>send sign-in codes, transactional messages, service notices, and support replies;</li>
          <li>debug errors, monitor reliability, protect users, and comply with law.</li>
        </ul>
      </Section>

      <Section title="5. Documents and AI processing">
        <p>
          Baindar is designed to work with personal and professional documents. Your uploaded
          documents may include sensitive information if you choose to upload it. We process that
          content to make the binder useful: parsing files, extracting text and metadata, rendering
          reader sections, indexing content, searching, summarizing, and answering your questions.
        </p>
        <p>
          When you use AI features, Baindar may send your prompts, relevant document excerpts,
          notes, highlights, summaries, conversation history, and related metadata to AI model
          providers or AI gateway services so they can generate a response. We do not use your
          documents to train Baindar-owned models. AI providers process content under their own
          terms and configurations.
        </p>
      </Section>

      <Section title="6. How we share information">
        <p>
          We do not sell personal information, and we do not share it for cross-context behavioral
          advertising. We may disclose information to the following categories of recipients:
        </p>
        <ul>
          <li>
            <strong>Infrastructure providers:</strong> hosting, storage, database, durable object,
            email, logging, and security providers, including Cloudflare.
          </li>
          <li>
            <strong>Authentication providers:</strong> providers you choose for sign-in, such as
            Google or Apple.
          </li>
          <li>
            <strong>AI providers:</strong> model providers and AI gateway services used to generate
            summaries and conversational responses.
          </li>
          <li>
            <strong>Billing providers:</strong> payment and subscription providers, including Polar,
            for checkout, subscription management, tax, fraud, and customer portal functions.
          </li>
          <li>
            <strong>Professional and legal recipients:</strong> advisors, auditors, insurers,
            courts, law enforcement, regulators, or other parties when reasonably necessary for
            legal, safety, compliance, or rights-protection purposes.
          </li>
          <li>
            <strong>Business transfer recipients:</strong> parties involved in a merger,
            acquisition, financing, reorganization, or sale of assets, subject to appropriate
            protections for user information.
          </li>
        </ul>
      </Section>

      <Section title="7. Cookies and local storage">
        <p>
          Baindar uses cookies, local storage, and similar technologies for authentication, session
          continuity, security, app preferences, and basic operation. We do not currently use these
          technologies to run third-party behavioral advertising. Because Baindar does not use
          behavioral advertising, browser "Do Not Track" signals do not change the Service's
          behavior today.
        </p>
      </Section>

      <Section title="8. Retention and deletion">
        <p>
          We keep account information, documents, derived document data, notes, highlights,
          conversations, usage records, and billing records for as long as needed to provide the
          Service, comply with law, resolve disputes, prevent abuse, and enforce agreements. If you
          delete a document, Baindar removes the catalog record and starts background cleanup for
          related storage. Some residual copies may remain for a limited time in backups, logs, or
          provider systems.
        </p>
        <p>
          You can request account deletion or access help by contacting{" "}
          <a href="mailto:support@baindar.com">support@baindar.com</a>.
        </p>
      </Section>

      <Section title="9. Security">
        <p>
          We use technical and organizational safeguards designed to protect information in the
          Service, including authenticated access, per-user data scoping, provider access controls,
          and operational monitoring. No internet service is perfectly secure, and you are
          responsible for keeping your email account, sign-in provider, devices, and sessions safe.
        </p>
      </Section>

      <Section title="10. Your choices and rights">
        <p>
          You may be able to access, correct, export, or delete certain information through the
          Service. Depending on where you live, you may also have legal rights to request access,
          correction, deletion, portability, restriction, objection, or information about how we
          process personal information. You may also have the right not to receive discriminatory
          treatment for exercising privacy rights.
        </p>
        <p>
          To make a request, contact <a href="mailto:support@baindar.com">support@baindar.com</a>.
          We may need to verify your identity and may deny requests where permitted or required by
          law.
        </p>
      </Section>

      <Section title="11. International users">
        <p>
          Baindar is operated from the United States. If you use the Service from outside the United
          States, your information may be processed in the United States and other countries where
          our service providers operate. Those countries may have data protection laws different
          from the laws where you live.
        </p>
      </Section>

      <Section title="12. Children">
        <p>
          Baindar is not intended for children under 13, and we do not knowingly collect personal
          information from children under 13. If you believe a child has provided information to us,
          contact us and we will take appropriate steps to remove it.
        </p>
      </Section>

      <Section title="13. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. If we make material changes, we will
          update the date above and provide notice when required by law or when the change
          materially affects how we use your information.
        </p>
      </Section>

      <Section title="14. Contact">
        <p>
          Questions or privacy requests can be sent to{" "}
          <a href="mailto:support@baindar.com">support@baindar.com</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
