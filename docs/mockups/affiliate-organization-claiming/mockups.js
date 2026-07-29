(() => {
  const icons = {
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.8 3h15.2a2 2 0 0 0 1.8-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  };

  const flowNames = {
    event: 'Public event',
    create: 'Create organization',
    claim: 'Initial claim',
    access: 'Claimed profile and owner staffing',
    dispute: 'Ownership dispute',
  };

  function topbar(active = 'Discover') {
    return `
      <header class="app-topbar">
        <div class="app-logo">
          <span class="app-logo-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          BracketIQ
        </div>
        <nav class="app-nav" aria-label="Product navigation">
          <span>${active}</span><span>My events</span><span>Organizations</span><span>Messages</span>
        </nav>
        <span class="user-dot" aria-label="Signed in as Jordan Lee">JL</span>
      </header>`;
  }

  function badge(type, label) {
    return `<span class="ownership-badge ${type}">${type === 'verified' ? '◆' : type === 'claimed' ? '✓' : type === 'review' ? '◌' : '○'} ${label}</span>`;
  }

  function eventPage(state) {
    const configs = {
      unclaimed: {
        badges: badge('unclaimed', 'Unclaimed profile'),
        strip: `
          <div class="claim-strip">
            <div><strong>Do you represent River City Sports Club?</strong>Claim the organization profile to manage its details and respond to reviews.</div>
            <button class="text-link" data-goto="CL-00">Claim profile →</button>
          </div>`,
      },
      claimed: {
        badges: badge('claimed', 'Claimed profile'),
        strip: '',
      },
      verified: {
        badges: `${badge('claimed', 'Claimed profile')} ${badge('verified', 'Website verified')}`,
        strip: '',
      },
      review: {
        badges: badge('review', 'Ownership under review'),
        strip: `
          <div class="claim-strip review-strip">
            <div><strong>Ownership review in progress</strong>Event information and registration links remain available while BracketIQ reviews profile ownership.</div>
            <button class="text-link" data-goto="DS-01">View issue options →</button>
          </div>`,
      },
      firstparty: {
        badges: badge('claimed', 'Claimed profile'),
        strip: '',
      },
    };
    const config = configs[state];
    return `
      <div class="app-chrome">
        ${topbar()}
        <main class="product-page">
          <div class="breadcrumb"><span>Discover</span><span>/</span><span>Basketball</span><span>/</span><b>Summer Skills Camp</b></div>
          <article class="event-shell">
            <section class="event-hero">
              <div class="event-hero-content">
                <div class="event-badges"><span>Camp</span><span>Basketball</span><span>Registration on organizer site</span></div>
                <h1>Summer Skills Camp</h1>
                <p>Hosted by River City Sports Club</p>
                <div class="event-meta-row">
                  <span>◷ Jul 13–17, 9:00 AM</span>
                  <span>⌖ Portland, Oregon</span>
                  <span>◎ Ages 10–15</span>
                </div>
              </div>
            </section>
            <div class="event-grid">
              <div>
                <section class="content-section">
                  <h2>About this event</h2>
                  <div class="host-card">
                    <span class="host-logo">RC</span>
                    <div>
                      <span class="host-label">Hosted by</span>
                      <div class="host-name">River City Sports Club</div>
                      <div class="host-sub">Open organization profile</div>
                    </div>
                    ${config.badges ? `<div class="badge-row">${config.badges}</div>` : ''}
                  </div>
                  ${config.strip}
                  <p class="event-description">A five-day basketball camp focused on ball handling, shooting mechanics, team concepts, and live play. Groups are organized by age and experience.</p>
                </section>
                <section class="content-section">
                  <div class="meta-stack">
                    <div class="meta-pill"><span>Start date</span><b>Monday, July 13 · 9:00 AM</b></div>
                    <div class="meta-pill"><span>End date</span><b>Friday, July 17 · 3:00 PM</b></div>
                    <div class="meta-pill"><span>Location</span><b>River City Fieldhouse</b></div>
                    <div class="meta-pill"><span>Address</span><b>1840 SE Water Avenue, Portland</b></div>
                  </div>
                </section>
              </div>
              <aside class="join-card">
                <div class="price-label">Organizer price</div>
                <div class="price">$245</div>
                <button class="button-primary button-full">View event on organizer site ↗</button>
                <p class="join-card-note">Registration continues on River City Sports Club’s website.</p>
                <div class="join-facts">
                  <div><span>Registration</span><b>Open</b></div>
                  <div><span>Registration closes</span><b>July 10</b></div>
                  <div><span>Source checked</span><b>Today</b></div>
                </div>
              </aside>
            </div>
          </article>
        </main>
      </div>`;
  }

  function stepper(active, labels = ['Identity', 'Details', 'Review', 'Finish']) {
    return `<div class="stepper">${labels.map((label, index) => {
      const number = index + 1;
      const state = number < active ? 'done' : number === active ? 'active' : '';
      return `<div class="step ${state}"><i>${number < active ? '✓' : number}</i><span>${label}</span></div>`;
    }).join('')}</div>`;
  }

  function wizard(title, intro, activeStep, body, labels, extraClass = '') {
    return `
      <div class="wizard-page">
        ${topbar('Organizations')}
        <main class="wizard-wrap ${extraClass}">
          <header class="wizard-head">
            <div><h1>${title}</h1><p>${intro}</p></div>
            <button class="wizard-close" aria-label="Close">×</button>
          </header>
          ${stepper(activeStep, labels)}
          ${body}
        </main>
      </div>`;
  }

  function actions(back, primary, primaryTarget, secondary = '') {
    return `
      <div class="wizard-actions">
        ${back ? `<button class="button-secondary" data-goto="${back}">← Back</button>` : '<span></span>'}
        <div class="wizard-actions-end">
          ${secondary}
          <button class="button-primary" ${primaryTarget ? `data-goto="${primaryTarget}"` : ''}>${primary}</button>
        </div>
      </div>`;
  }

  function creationFind() {
    return wizard(
      'Create an organization',
      'Start with the basics. We will check for an existing profile before asking for setup details.',
      1,
      `<section class="wizard-card narrow">
        <h2>Find or create your organization</h2>
        <p>Use the organization’s public name and official website. This helps prevent duplicate profiles.</p>
        <div class="form-grid one">
          <label class="field">
            <span class="field-label">Organization name</span>
            <input class="input" value="River City Sports Club" aria-label="Organization name">
          </label>
          <label class="field">
            <span class="field-label">Official website <small>Recommended</small></span>
            <input class="input" value="https://rivercitysports.org" aria-label="Official website">
            <p class="field-hint">Use the organization’s own site—not an event registration, social media, or directory page.</p>
          </label>
          <label class="field">
            <span class="field-label">City or facility location</span>
            <input class="input" value="Portland, Oregon" aria-label="Location">
          </label>
        </div>
        <div class="search-status"><span class="spinner"></span><span>Checking BracketIQ profiles, affiliate listings, and verified website domains…</span></div>
        ${actions('', 'Check for matches', 'CR-02')}
      </section>`
    );
  }

  function organizationMatch({ claimed = false } = {}) {
    return wizard(
      'Create an organization',
      'We found a profile that appears to represent the organization you entered.',
      1,
      `<section class="wizard-card">
        <div class="match-summary exact">${icons.search}<div><strong>Exact match found</strong><p>The official website, organization name, and location match this existing affiliate profile.</p></div></div>
        <div class="match-card">
          <span class="match-logo">RC</span>
          <div>
            <h3>River City Sports Club</h3>
            <div class="match-meta"><span>Portland, Oregon</span><span>rivercitysports.org</span>${claimed ? badge('claimed', 'Claimed') : badge('unclaimed', 'Unclaimed')}</div>
            <div class="match-reasons"><span>Exact website</span><span>Exact name</span><span>Nearby location</span></div>
          </div>
          <div class="match-actions">
            ${claimed
              ? `<button class="button-primary">Open organization profile</button>
                 <button class="button-secondary" data-goto="TR-01">Request ownership transfer</button>
                 <button class="button-secondary" data-goto="DS-01">Report ownership issue</button>`
              : `<button class="button-primary" data-goto="CL-00">Claim this profile</button>
                 <button class="button-secondary">View profile</button>`}
          </div>
        </div>
        <div class="alert-box info" style="margin-top:14px">${icons.info}<div><strong>${claimed ? 'This profile already has an owner' : 'Why claiming is better than creating another profile'}</strong>${claimed ? 'Staff are added by the organization owner. A matching work email cannot replace the current owner; use a consensual ownership transfer or report a genuine ownership issue.' : 'Claiming keeps the existing events, teams, rentals, reviews, and search history together under one trusted organization profile.'}</div></div>
        ${actions('CR-01', 'Continue', claimed ? 'AC-01' : 'CL-00')}
      </section>`
    );
  }

  function relatedMatch() {
    return wizard(
      'Create an organization',
      'These profiles are related to what you entered. Confirm whether one is yours.',
      1,
      `<section class="wizard-card">
        <div class="match-summary warning">${icons.alert}<div><strong>Possible existing profiles</strong><p>The name, location, or parent website is similar, but we cannot tell whether this is the same organization.</p></div></div>
        <div class="match-card">
          <span class="match-logo">RC</span>
          <div><h3>River City Sports Club</h3><div class="match-meta"><span>Portland, Oregon</span>${badge('claimed', 'Claimed')}</div><div class="match-reasons"><span>Similar name</span><span>Same city</span></div></div>
          <div class="match-actions"><button class="button-secondary">Open profile</button></div>
        </div>
        <div class="match-card">
          <span class="match-logo">RY</span>
          <div><h3>River City Youth Basketball</h3><div class="match-meta"><span>Gresham, Oregon</span>${badge('unclaimed', 'Unclaimed')}</div><div class="match-reasons"><span>Shared parent domain</span></div></div>
          <div class="match-actions"><button class="button-secondary" data-goto="CL-00">Claim profile</button></div>
        </div>
        <label class="checkbox-row" style="margin-top:16px"><span class="checkbox">✓</span><span><strong>This is a different organization.</strong><br>I have reviewed the possible matches and want to create a separate profile.</span></label>
        ${actions('CR-01', 'Continue as new organization', 'CR-06')}
      </section>`
    );
  }

  function domainConflict() {
    return wizard(
      'Create an organization',
      'The website you entered is already verified for another organization.',
      1,
      `<section class="wizard-card narrow">
        <div class="match-summary danger">${icons.alert}<div><strong>Verified website conflict</strong><p>rivercitysports.org is already the verified website for River City Sports Club. It cannot be attached to another profile automatically.</p></div></div>
        <div class="match-card">
          <span class="match-logo">RC</span>
          <div><h3>River City Sports Club</h3><div class="match-meta"><span>Portland, Oregon</span>${badge('verified', 'Website verified')}</div></div>
          <div class="match-actions"><button class="button-secondary">Open profile</button></div>
        </div>
        <h2 style="margin-top:20px">Is your organization a distinct branch or program?</h2>
        <p>An administrator can review whether the profiles should be separate and whether the parent website may be shared.</p>
        <div class="form-grid one">
          <label class="field"><span class="field-label">How is your organization different?</span><textarea class="textarea">We operate the Eastside youth program under the same parent organization, with separate staff and events.</textarea></label>
        </div>
        ${actions('CR-01', 'Submit duplicate-profile review', 'DS-05', '<button class="button-secondary">Open existing profile</button>')}
      </section>`
    );
  }

  function creationDetails() {
    return wizard(
      'Create an organization',
      'No existing profile matched. Add the public and management details for the new organization.',
      2,
      `<section class="wizard-card">
        <h2>Organization details</h2>
        <p>Your account becomes the initial owner. Website control is verified separately after creation.</p>
        <div class="form-grid">
          <label class="field full"><span class="field-label">Description</span><textarea class="textarea">Community basketball programs, camps, leagues, and facility rentals for youth and adults.</textarea></label>
          <label class="field"><span class="field-label">Visibility</span><select class="select"><option>Listed — appears in Discover</option></select></label>
          <label class="field"><span class="field-label">Sports</span><input class="input" value="Basketball" aria-label="Sports"></label>
          <label class="field full"><span class="field-label">Organization tools</span><div class="radio-list"><label class="checkbox-row"><span class="checkbox">✓</span><span>Events and registration</span></label><label class="checkbox-row"><span class="checkbox">✓</span><span>Teams and rosters</span></label><label class="checkbox-row"><span class="checkbox">✓</span><span>Facility rentals</span></label></div></label>
          <label class="field"><span class="field-label">Organization type</span><select class="select"><option>Nonprofit or association</option></select></label>
          <label class="field"><span class="field-label">Logo</span><input class="input" value="river-city-logo.png" aria-label="Logo"></label>
          <label class="field full"><span class="field-label">Tax responsibility</span><div class="checkbox-row"><span class="checkbox">✓</span><span>I confirm this organization is responsible for determining taxability for its events and rentals.</span></div></label>
        </div>
        ${actions('CR-04', 'Review organization', 'CR-07')}
      </section>`
    );
  }

  function creationReview() {
    return wizard(
      'Create an organization',
      'Confirm the organization identity and settings before creating the profile.',
      3,
      `<section class="wizard-card">
        <h2>Review your organization</h2>
        <p>The server will run one final duplicate check when you create the profile.</p>
        <div class="review-list">
          <div class="review-row"><div><strong>Identity</strong><span>River City Eastside Basketball · Portland, Oregon</span></div><div class="review-value">Edit</div></div>
          <div class="review-row"><div><strong>Website</strong><span>https://eastside.rivercitybasketball.org</span><small>No exact profile or verified-domain conflict found</small></div><div class="review-value">Checked now</div></div>
          <div class="review-row"><div><strong>Visibility and tools</strong><span>Listed · Events, teams, rentals</span></div><div class="review-value">Edit</div></div>
          <div class="review-row"><div><strong>Ownership</strong><span>Jordan Lee becomes the initial profile owner</span><small>Website verification level: none</small></div><div class="review-value">Claimed profile</div></div>
          <div class="review-row"><div><strong>Tax responsibility</strong><span>Nonprofit or association · Agreement accepted</span></div><div class="review-value">Confirmed</div></div>
        </div>
        <div class="alert-box info" style="margin-top:14px">${icons.info}<div><strong>Creating the profile does not verify the website</strong>You can verify control later using work email, DNS, website tag, or manual review.</div></div>
        ${actions('CR-06', 'Create organization', 'CR-09')}
      </section>`
    );
  }

  function serverConflict() {
    return wizard(
      'Create an organization',
      'Another matching profile was found during the final server check.',
      3,
      `<section class="wizard-card narrow">
        <div class="status-hero">
          <div class="status-icon warning">!</div>
          <h2>This organization now has a profile</h2>
          <p>River City Eastside Basketball was created or matched after your first check. We stopped this submission before creating a duplicate.</p>
        </div>
        <div class="match-card">
          <span class="match-logo">RE</span>
          <div><h3>River City Eastside Basketball</h3><div class="match-meta"><span>Portland, Oregon</span>${badge('unclaimed', 'Unclaimed')}</div><div class="match-reasons"><span>Exact website</span><span>Exact name</span></div></div>
          <div class="match-actions"><button class="button-primary" data-goto="CL-00">Claim this profile</button></div>
        </div>
        ${actions('CR-01', 'Use existing profile', 'CL-00')}
      </section>`
    );
  }

  function creationSuccess() {
    return wizard(
      'Organization created',
      'The profile is ready. Website verification is optional and can be completed next.',
      4,
      `<section class="wizard-card narrow">
        <div class="status-hero">
          <div class="status-icon success">✓</div>
          <h2>River City Eastside Basketball is ready</h2>
          <p>You are the owner of the new profile. It has not received a website-verification badge yet.</p>
          <div class="badge-row" style="justify-content:center">${badge('claimed', 'Claimed profile')}</div>
          <div class="wizard-actions" style="justify-content:center">
            <button class="button-secondary">Open organization</button>
            <button class="button-primary" data-goto="CL-01">Verify organization website</button>
          </div>
        </div>
      </section>`
    );
  }

  function accountGate() {
    return wizard(
      'Claim River City Sports Club',
      'Sign in with a verified BracketIQ account before submitting an ownership request.',
      1,
      `<section class="wizard-card narrow">
        <div class="host-card" style="margin-bottom:18px">
          <span class="host-logo">RC</span>
          <div><span class="host-label">Organization profile</span><div class="host-name">River City Sports Club</div><div class="host-sub">rivercitysports.org · Portland, Oregon</div></div>
          <div class="badge-row">${badge('unclaimed', 'Unclaimed')}</div>
        </div>
        <div class="status-hero">
          <div class="status-icon">→</div>
          <h2>Sign in to continue</h2>
          <p>Your BracketIQ account email must be verified. You may use a different work email as claim evidence.</p>
          <button class="button-primary" data-goto="CL-01">Sign in or create account</button>
        </div>
        <div class="alert-box warning">${icons.alert}<div><strong>Account email not verified?</strong>We will send a separate account-verification message before you can start the claim. This does not have to match the organization website.</div></div>
      </section>`,
      ['Account', 'Proof', 'Review', 'Accept']
    );
  }

  function claimMethods() {
    return wizard(
      'Claim River City Sports Club',
      'Choose the strongest proof you can complete. You can switch methods before submitting.',
      2,
      `<section class="wizard-card">
        <h2>How can you verify your connection?</h2>
        <p>Each method proves something different. Website control earns the strongest public trust signal.</p>
        <div class="method-grid">
          <button class="radio-card selected" data-goto="CL-02"><span class="option-icon">@</span><span><strong>Work email</strong><small>Receive a link at an address ending in @rivercitysports.org.</small></span></button>
          <button class="radio-card" data-goto="CL-04"><span class="option-icon">DNS</span><span><strong>DNS record</strong><small>Add a temporary TXT record to rivercitysports.org.</small></span></button>
          <button class="radio-card" data-goto="CL-05"><span class="option-icon">&lt;/&gt;</span><span><strong>Website tag</strong><small>Add a temporary verification tag to the official homepage.</small></span></button>
          <button class="radio-card" data-goto="CL-06"><span class="option-icon">…</span><span><strong>Manual review</strong><small>Explain your role and give public evidence our team can verify.</small></span></button>
        </div>
        <div class="alert-box info" style="margin-top:14px">${icons.info}<div><strong>Shared registration and social sites</strong>An email or page on SportsEngine, TeamSnap, Eventbrite, Facebook, or another shared platform cannot automatically prove ownership. Use the organization’s direct domain or manual review.</div></div>
        ${actions('CL-00', 'Continue with work email', 'CL-02')}
      </section>`,
      ['Account', 'Proof', 'Review', 'Accept']
    );
  }

  function workEmail() {
    return wizard(
      'Verify with a work email',
      'We will send a one-time link to the organization address. It will not replace your BracketIQ login email.',
      2,
      `<section class="wizard-card narrow">
        <h2>Enter your organization email</h2>
        <p>The email must use the verified rivercitysports.org domain.</p>
        <div class="form-grid one">
          <label class="field"><span class="field-label">Work email</span><input class="input" value="jordan@rivercitysports.org" type="email"></label>
          <label class="field"><span class="field-label">Your role</span><select class="select"><option>Program director</option><option>Organization administrator</option><option>Owner or executive</option></select></label>
        </div>
        <div class="alert-box success" style="margin-top:14px">${icons.check}<div><strong>Email domain matches</strong>rivercitysports.org is approved as this organization’s official website domain.</div></div>
        ${actions('CL-01', 'Send verification email', 'CL-03')}
      </section>`,
      ['Account', 'Proof', 'Review', 'Accept']
    );
  }

  function emailSent() {
    return wizard(
      'Check your work email',
      'The verification link is single-use and expires in 30 minutes.',
      2,
      `<section class="wizard-card narrow">
        <div class="status-hero">
          <div class="status-icon">@</div>
          <h2>We sent a link to j•••••@rivercitysports.org</h2>
          <p>Open the message on this device or browser. The link verifies the email for this claim only.</p>
          <div class="status-timeline">
            <div><i>✓</i><span>Account verified</span><small>Complete</small></div>
            <div class="waiting"><i>•</i><span>Work email confirmation</span><small>Expires in 28:41</small></div>
            <div class="waiting"><i>•</i><span>Ownership acceptance</span><small>Waiting</small></div>
          </div>
          <div class="wizard-actions" style="justify-content:center"><button class="button-secondary">Resend email</button><button class="button-primary" data-goto="CL-08">Mock: open verified link</button></div>
        </div>
        <div class="alert-box warning">${icons.alert}<div><strong>Opened under another account?</strong>The link only works for the signed-in claimant. Sign back into the account that started this request.</div></div>
      </section>`,
      ['Account', 'Proof', 'Review', 'Accept']
    );
  }

  function dnsProof() {
    return wizard(
      'Verify with DNS',
      'Add the temporary TXT record below. It can be removed after verification.',
      2,
      `<section class="wizard-card narrow">
        <h2>Add one DNS TXT record</h2>
        <p>Use the DNS provider for rivercitysports.org. Changes may take time to become visible.</p>
        <div class="review-list">
          <div class="review-row"><div><strong>Record type</strong><span>TXT</span></div><div class="review-value">Required</div></div>
          <div class="review-row"><div><strong>Host / name</strong><span>_bracketiq-challenge</span></div><div class="review-value">Copy</div></div>
        </div>
        <div class="code-box"><span>bracketiq-claim=bcq_7P9AZ4H2JQX8</span><button class="copy-button">Copy</button></div>
        <div class="alert-box info" style="margin-top:14px">${icons.info}<div><strong>Safe verification boundary</strong>BracketIQ only checks the expected TXT record on the approved official domain. It never asks for DNS credentials.</div></div>
        ${actions('CL-01', 'Check DNS record', 'CL-08', '<button class="button-secondary">Check later</button>')}
      </section>`,
      ['Account', 'Proof', 'Review', 'Accept']
    );
  }

  function htmlProof() {
    return wizard(
      'Verify with a website tag',
      'Add this temporary meta tag to the official homepage, then ask BracketIQ to check it.',
      2,
      `<section class="wizard-card narrow">
        <h2>Add the verification tag</h2>
        <p>Place it inside the <code>&lt;head&gt;</code> of https://rivercitysports.org/. Redirects must stay on the same organization domain.</p>
        <div class="code-box"><span>&lt;meta name="bracketiq-site-verification" content="bcq_7P9AZ4H2JQX8"&gt;</span><button class="copy-button">Copy</button></div>
        <div class="review-list" style="margin-top:14px">
          <div class="review-row"><div><strong>Page checked</strong><span>https://rivercitysports.org/</span></div><div class="review-value">Official domain</div></div>
          <div class="review-row"><div><strong>Challenge expires</strong><span>August 5, 2026 at 3:20 PM</span></div><div class="review-value">7 days</div></div>
        </div>
        <div class="alert-box warning" style="margin-top:14px">${icons.alert}<div><strong>Hosted by a shared platform?</strong>If you cannot edit the homepage or it lives on a shared site, choose manual review instead.</div></div>
        ${actions('CL-01', 'Check website', 'CL-08', '<button class="button-secondary" data-goto="CL-06">Use manual review</button>')}
      </section>`,
      ['Account', 'Proof', 'Review', 'Accept']
    );
  }

  function manualClaim() {
    return wizard(
      'Request manual review',
      'Tell us how you represent the organization and give evidence we can verify publicly.',
      2,
      `<section class="wizard-card">
        <h2>Organization relationship</h2>
        <p>Do not upload identity documents, tax records, payment details, or private legal documents.</p>
        <div class="form-grid">
          <label class="field"><span class="field-label">Your role</span><input class="input" value="Program director"></label>
          <label class="field"><span class="field-label">Official contact</span><input class="input" value="503-555-0142"></label>
          <label class="field full"><span class="field-label">Public evidence URL <small>Optional</small></span><input class="input" value="https://rivercitysports.org/about/staff"></label>
          <label class="field full"><span class="field-label">Explain your request</span><textarea class="textarea">I manage registration and communications for River City Sports Club. Our staff page lists me as program director, but our organization uses a shared municipal email system.</textarea></label>
        </div>
        <div class="alert-box info" style="margin-top:14px">${icons.info}<div><strong>What the review team checks</strong>Official website contacts, publicly listed staff, organization directories, affiliate source history, and any conflicting owners or requests.</div></div>
        ${actions('CL-01', 'Submit for review', 'CL-07')}
      </section>`,
      ['Account', 'Proof', 'Review', 'Accept']
    );
  }

  function claimPending() {
    return wizard(
      'Claim under review',
      'Your request is saved. The profile stays unclaimed until it is approved and accepted with MFA.',
      3,
      `<section class="wizard-card narrow">
        <div class="status-hero">
          <div class="status-icon">◷</div>
          <h2>Manual review submitted</h2>
          <p>Most requests receive a response after the team verifies the organization’s public information.</p>
          <div class="status-timeline">
            <div><i>✓</i><span>Request submitted</span><small>Jul 29</small></div>
            <div class="waiting"><i>•</i><span>Administrator review</span><small>In progress</small></div>
            <div class="waiting"><i>•</i><span>MFA ownership acceptance</span><small>Waiting</small></div>
          </div>
        </div>
        <div class="alert-box warning">${icons.alert}<div><strong>More information may be requested</strong>Respond through the claim status page. Support messages never ask for passwords, MFA codes, payment information, or identity documents.</div></div>
      </section>`,
      ['Account', 'Proof', 'Review', 'Accept']
    );
  }

  function mfaAccept(title = 'Accept organization ownership', transfer = false) {
    return wizard(
      title,
      transfer ? 'The current owner approved the transfer. Complete MFA to become the new owner.' : 'Your evidence was approved. Complete MFA before BracketIQ changes organization ownership.',
      4,
      `<section class="wizard-card narrow">
        <div class="alert-box success">${icons.check}<div><strong>${transfer ? 'Transfer approved by Taylor Morgan' : 'Organization evidence approved'}</strong>${transfer ? 'The current owner completed their approval and MFA on July 29.' : 'Verified through ' + (transfer ? 'owner approval' : 'rivercitysports.org') + '. This approval expires in 7 days.'}</div></div>
        <div class="status-hero">
          <div class="status-icon">•••</div>
          <h2>Enter your authenticator code</h2>
          <p>Use the six-digit code from the authenticator app connected to your BracketIQ account.</p>
          <div class="mfa-code"><span>4</span><span>8</span><span>1</span><span>2</span><span>0</span><span>6</span></div>
          <button class="button-primary" data-goto="${transfer ? 'TR-04' : 'CL-09'}">${transfer ? 'Accept transfer' : 'Accept ownership'}</button>
          <p class="field-hint">No authenticator configured? Set up MFA in your profile, then return here.</p>
        </div>
      </section>`,
      ['Account', 'Proof', 'Review', 'Accept']
    );
  }

  function claimSuccess() {
    return wizard(
      'Organization claimed',
      'Ownership is active and the organization profile is ready to manage.',
      4,
      `<section class="wizard-card narrow">
        <div class="status-hero">
          <div class="status-icon success">✓</div>
          <h2>You now manage River City Sports Club</h2>
          <p>The existing events, teams, rentals, and reviews remain connected. You can update the profile and publish official review responses.</p>
          <div class="badge-row" style="justify-content:center">${badge('claimed', 'Claimed profile')} ${badge('verified', 'Website verified')}</div>
          <div class="wizard-actions" style="justify-content:center"><button class="button-secondary" data-goto="EV-03">View public event</button><button class="button-primary">Manage organization</button></div>
        </div>
      </section>`,
      ['Account', 'Proof', 'Review', 'Accept']
    );
  }

  function claimFailure() {
    return wizard(
      'Claim needs attention',
      'Verification did not complete. Ownership and public trust signals have not changed.',
      3,
      `<section class="wizard-card narrow">
        <div class="status-hero">
          <div class="status-icon danger">×</div>
          <h2>The verification link expired</h2>
          <p>The email link is older than 30 minutes or was already used. Start a fresh challenge from the same signed-in account.</p>
          <div class="wizard-actions" style="justify-content:center"><button class="button-secondary" data-goto="CL-01">Choose another method</button><button class="button-primary" data-goto="CL-02">Send a new email</button></div>
        </div>
        <div class="alert-box danger">${icons.alert}<div><strong>If a manual claim is rejected</strong>The status page shows the user-facing reason and whether you may resubmit. Internal administrator notes and other claimants’ evidence remain private.</div></div>
      </section>`,
      ['Account', 'Proof', 'Review', 'Accept']
    );
  }

  function accessChoices() {
    return wizard(
      'River City Sports Club is already claimed',
      'Staff access is managed by the organization owner. These options are only for changing or contesting ownership.',
      1,
      `<section class="wizard-card">
        <div class="host-card" style="margin-bottom:16px">
          <span class="host-logo">RC</span>
          <div><span class="host-label">Current profile</span><div class="host-name">River City Sports Club</div><div class="host-sub">rivercitysports.org · Portland, Oregon</div></div>
          <div class="badge-row">${badge('claimed', 'Claimed')} ${badge('verified', 'Website verified')}</div>
        </div>
        <div class="request-choice-grid two">
          <article class="request-choice transfer"><span class="option-icon">⇄</span><h3>Request ownership transfer</h3><p>The current owner agrees to hand over full organization ownership. Both people approve with MFA.</p><button class="button-primary" data-goto="TR-01">Request transfer</button></article>
          <article class="request-choice dispute"><span class="option-icon">!</span><h3>Report an ownership issue</h3><p>The owner is unavailable, the claim looks unauthorized, or profiles need correction. BracketIQ reviews the dispute.</p><button class="button-secondary" data-goto="DS-01">Report issue</button></article>
        </div>
        <div class="alert-box info" style="margin-top:15px">${icons.info}<div><strong>Need staff access?</strong>Contact the organization owner directly. Owners add coaches, event managers, finance staff, and other users from the organization’s Staff page; BracketIQ does not send unsolicited public access requests.</div></div>
      </section>`,
      ['Ownership', 'Verify', 'Owner review', 'Finish']
    );
  }

  function ownerStaffList() {
    return `
      <div class="app-chrome">
        ${topbar('Organizations')}
        <div class="owner-console">
          <aside class="owner-side"><strong>River City Sports Club</strong><span>Overview</span><span>Events</span><span>Teams</span><span class="active">Staff · 4</span><span>Ownership</span><span>Settings</span></aside>
          <main class="owner-main">
            <div class="request-card-head">
              <div><h1>Staff</h1><p>Add people who help manage this organization, then choose their role and permissions.</p></div>
              <button class="button-primary" data-goto="OW-02">+ Add staff member</button>
            </div>
            <article class="request-card" style="margin-top:18px">
              <div class="request-card-head">
                <div><h3>Taylor Morgan</h3><p>Organization owner · Full organization access</p></div>
                ${badge('claimed', 'Owner')}
              </div>
            </article>
            <article class="request-card" style="margin-top:9px"><div class="request-card-head"><div><h3>Jordan Lee</h3><p>Event manager · Events, teams, and participant communications</p></div><button class="button-secondary">Edit role</button></div></article>
            <article class="request-card" style="margin-top:9px"><div class="request-card-head"><div><h3>Casey Nguyen</h3><p>Coach · Team and roster access</p></div><button class="button-secondary">Edit role</button></div></article>
            <article class="request-card" style="margin-top:9px"><div class="request-card-head"><div><h3>alex@rivercitysports.org</h3><p>Finance staff · Invitation pending</p></div><button class="button-secondary">Resend invite</button></div></article>
            <div class="alert-box info" style="margin-top:14px">${icons.info}<div><strong>Owner-initiated access only</strong>People cannot request staff access from the public profile. Organization owners and authorized staff add users here.</div></div>
          </main>
        </div>
      </div>`;
  }

  function ownerAddStaff() {
    return `
      <div class="app-chrome">
        ${topbar('Organizations')}
        <div class="owner-console">
          <aside class="owner-side"><strong>River City Sports Club</strong><span>Overview</span><span>Events</span><span>Teams</span><span class="active">Staff · 4</span><span>Ownership</span><span>Settings</span></aside>
          <main class="owner-main">
            <h1>Add staff member</h1>
            <p>Invite a known user and assign the minimum role they need.</p>
            <section class="wizard-card" style="margin-top:18px">
              <div class="form-grid one">
                <label class="field"><span class="field-label">Email address</span><input class="input" value="jordan@rivercitysports.org" type="email"><p class="field-hint">If they do not have a BracketIQ account yet, they will receive an invitation to create one.</p></label>
                <label class="field"><span class="field-label">Organization role</span><select class="select"><option>Event manager</option><option>Coach</option><option>Finance staff</option><option>Custom role</option></select></label>
                <div class="field"><span class="field-label">Permissions included</span><div class="radio-list"><label class="checkbox-row"><span class="checkbox">✓</span><span>Create and manage events</span></label><label class="checkbox-row"><span class="checkbox">✓</span><span>Manage teams and participants</span></label><label class="checkbox-row"><span class="checkbox">✓</span><span>Send organization communications</span></label></div></div>
                <label class="field"><span class="field-label">Invitation message <small>Optional</small></span><textarea class="textarea">Welcome to the River City staff workspace. I’ve added you as an event manager for our summer programs.</textarea></label>
              </div>
              <div class="alert-box warning" style="margin-top:14px">${icons.alert}<div><strong>This person will receive organization access</strong>Confirm the email and role before sending. Staff access does not transfer organization ownership.</div></div>
              ${actions('OW-01', 'Send staff invitation', '')}
            </section>
          </main>
        </div>
      </div>`;
  }

  function transferRequest() {
    return wizard(
      'Request ownership transfer',
      'Use this when the current owner agrees that you should become the new owner.',
      2,
      `<section class="wizard-card narrow">
        <div class="form-grid one">
          <label class="field"><span class="field-label">Work email or website proof</span><input class="input" value="jordan@rivercitysports.org"></label>
          <label class="field"><span class="field-label">Reason for transfer</span><select class="select"><option>Role or leadership change</option><option>Account handoff</option><option>Organization acquisition</option></select></label>
          <label class="field"><span class="field-label">Message to the current owner</span><textarea class="textarea">Taylor has moved off the board and asked me to take over the organization account as the new program director.</textarea></label>
        </div>
        <label class="checkbox-row" style="margin-top:14px"><span class="checkbox">✓</span><span>I understand this request needs the current owner’s approval and MFA, followed by my own MFA acceptance.</span></label>
        ${actions('AC-01', 'Send transfer request', 'TR-02')}
      </section>`,
      ['Request', 'Owner approval', 'New owner', 'Finish']
    );
  }

  function ownerTransferMfa() {
    return wizard(
      'Approve ownership transfer',
      'You are signed in as the current owner. Review the consequences before confirming with MFA.',
      2,
      `<section class="wizard-card narrow">
        <div class="alert-box warning">${icons.alert}<div><strong>You will no longer be the organization owner</strong>After Jordan accepts, your owner-level permissions end. Existing staff access is handled separately and is not guaranteed.</div></div>
        <div class="review-list" style="margin-top:14px">
          <div class="review-row"><div><strong>Organization</strong><span>River City Sports Club</span></div><div class="review-value">Claimed</div></div>
          <div class="review-row"><div><strong>Incoming owner</strong><span>Jordan Lee · j•••••@rivercitysports.org</span></div><div class="review-value">Domain verified</div></div>
          <div class="review-row"><div><strong>Your account</strong><span>Taylor Morgan</span></div><div class="review-value">Current owner</div></div>
        </div>
        <div class="status-hero" style="padding-bottom:0">
          <h2>Confirm with your authenticator</h2>
          <div class="mfa-code"><span>9</span><span>2</span><span>6</span><span>0</span><span>1</span><span>4</span></div>
          <button class="button-primary" data-goto="TR-03">Approve transfer</button>
        </div>
      </section>`,
      ['Request', 'Owner approval', 'New owner', 'Finish']
    );
  }

  function transferComplete() {
    return wizard(
      'Ownership transferred',
      'The transfer is complete and recorded in the organization ownership history.',
      4,
      `<section class="wizard-card narrow">
        <div class="status-hero">
          <div class="status-icon success">✓</div>
          <h2>Jordan Lee is now the owner</h2>
          <p>River City Sports Club remains claimed and website verified. Taylor Morgan has been notified that the transfer completed.</p>
          <div class="review-list">
            <div class="review-row"><div><strong>New owner</strong><span>Jordan Lee</span></div><div class="review-value">Active</div></div>
            <div class="review-row"><div><strong>Former owner</strong><span>Taylor Morgan</span></div><div class="review-value">Owner access ended</div></div>
          </div>
          <div class="wizard-actions" style="justify-content:center"><button class="button-primary">Manage organization</button></div>
        </div>
      </section>`,
      ['Request', 'Owner approval', 'New owner', 'Finish']
    );
  }

  function disputeStart() {
    return wizard(
      'Report an ownership issue',
      'Tell BracketIQ what is wrong and what outcome you are requesting. Filing does not immediately change the current owner.',
      1,
      `<section class="wizard-card">
        <h2>What is happening?</h2>
        <p>Choose the closest issue. We use this to route the evidence and review—not to decide the case automatically.</p>
        <div class="radio-list">
          <button class="radio-card selected"><span class="radio-dot"></span><span><strong>The current owner no longer represents the organization</strong><small>A former employee, volunteer, vendor, or board member still controls the profile.</small></span></button>
          <button class="radio-card"><span class="radio-dot"></span><span><strong>The current owner is unavailable</strong><small>The account is abandoned, inaccessible, or the owner has not responded to a transfer request.</small></span></button>
          <button class="radio-card"><span class="radio-dot"></span><span><strong>The claim appears unauthorized or misleading</strong><small>You believe the current claimant does not represent this organization.</small></span></button>
          <button class="radio-card"><span class="radio-dot"></span><span><strong>This is a duplicate or incorrect profile</strong><small>Profiles should be merged, separated, renamed, or linked to a different organization.</small></span></button>
        </div>
        <label class="field" style="margin-top:15px"><span class="field-label">Requested outcome</span><select class="select"><option>Transfer organization ownership to me</option><option>Review or remove the current claim</option><option>Merge or correct duplicate profiles</option></select></label>
        ${actions('AC-01', 'Continue to evidence', 'DS-02')}
      </section>`,
      ['Issue', 'Evidence', 'Review', 'Resolution']
    );
  }

  function disputeEvidence() {
    return wizard(
      'Support your ownership issue',
      'Verify your connection and provide public evidence. Strong proof does not create an automatic transfer.',
      2,
      `<section class="wizard-card">
        <h2>Affiliation and evidence</h2>
        <div class="form-grid">
          <label class="field"><span class="field-label">Your role</span><input class="input" value="Current program director"></label>
          <label class="field"><span class="field-label">Official work email</span><input class="input" value="jordan@rivercitysports.org"></label>
          <label class="field full"><span class="field-label">Public evidence URL</span><input class="input" value="https://rivercitysports.org/about/leadership"></label>
          <label class="field full"><span class="field-label">What changed?</span><textarea class="textarea">Taylor left the board in March. Our public leadership page lists me as the current program director. We sent a transfer request on July 10 and did not receive a response.</textarea></label>
          <label class="field full"><span class="field-label">Independent official contact</span><input class="input" value="board@rivercitysports.org"></label>
        </div>
        <div class="method-grid" style="margin-top:14px">
          <button class="radio-card selected"><span class="option-icon">@</span><span><strong>Work email verified</strong><small>j•••••@rivercitysports.org</small></span></button>
          <button class="radio-card"><span class="option-icon">DNS</span><span><strong>Add website-control proof</strong><small>Optional, stronger supporting evidence</small></span></button>
        </div>
        <div class="alert-box warning" style="margin-top:14px">${icons.alert}<div><strong>Do not submit private identity or financial documents</strong>BracketIQ reviews independently verifiable organizational evidence and may contact the current owner and official organization contacts.</div></div>
        ${actions('DS-01', 'Review ownership issue', 'DS-03')}
      </section>`,
      ['Issue', 'Evidence', 'Review', 'Resolution']
    );
  }

  function disputeReview() {
    return wizard(
      'Review ownership issue',
      'Confirm the request before notifying the current owner and sending it to BracketIQ administrators.',
      3,
      `<section class="wizard-card">
        <h2>Ready to submit</h2>
        <div class="review-list">
          <div class="review-row"><div><strong>Organization</strong><span>River City Sports Club</span></div><div class="review-value">Claimed</div></div>
          <div class="review-row"><div><strong>Issue</strong><span>Current owner no longer represents the organization</span></div><div class="review-value">Ownership dispute</div></div>
          <div class="review-row"><div><strong>Requested outcome</strong><span>Transfer ownership to Jordan Lee</span></div><div class="review-value">Requires MFA</div></div>
          <div class="review-row"><div><strong>Verified evidence</strong><span>Work email · Public leadership page · Official board contact</span></div><div class="review-value">3 items</div></div>
          <div class="review-row"><div><strong>Prior request</strong><span>Transfer request sent July 10 · Expired without response</span></div><div class="review-value">Linked</div></div>
        </div>
        <label class="checkbox-row" style="margin-top:15px"><span class="checkbox">✓</span><span>I certify that this request is accurate and understand that false or abusive reports may restrict my account.</span></label>
        <div class="alert-box info" style="margin-top:14px">${icons.info}<div><strong>What happens next</strong>The current owner receives a notice and may respond. Filing alone does not remove their access, claimed badge, or ranking boost.</div></div>
        ${actions('DS-02', 'Submit ownership issue', 'DS-04')}
      </section>`,
      ['Issue', 'Evidence', 'Review', 'Resolution']
    );
  }

  function disputeOwnerResponse() {
    return `
      <div class="app-chrome">
        ${topbar('Organizations')}
        <div class="owner-console">
          <aside class="owner-side"><strong>River City Sports Club</strong><span>Overview</span><span>Staff</span><span class="active">Ownership requests · 1</span><span>Settings</span></aside>
          <main class="owner-main">
            <h1>Ownership issue response</h1>
            <p>BracketIQ is reviewing a request about this profile’s ownership.</p>
            <article class="request-card">
              <div class="request-card-head"><div><h3>Jordan Lee requested an ownership review</h3><p>Reason: current owner no longer represents the organization · Requested outcome: ownership transfer</p></div>${badge('claimed', 'You remain owner')}</div>
              <div class="alert-box info" style="margin-top:14px">${icons.info}<div><strong>Your profile has not changed</strong>This report is pending intake. Your access and public trust status remain active unless an administrator finds credible evidence requiring formal review.</div></div>
              <label class="field" style="margin-top:14px"><span class="field-label">Your response</span><textarea class="textarea">I am still the board treasurer and manage the organization account. Jordan should receive event-manager access, but ownership should remain with the board account.</textarea></label>
              <label class="field" style="margin-top:10px"><span class="field-label">Public evidence URL <small>Optional</small></span><input class="input" value="https://rivercitysports.org/about/board"></label>
              <div class="request-card-actions"><button class="button-primary" data-goto="DS-05">Submit response</button><button class="button-secondary">Request more time</button></div>
            </article>
          </main>
        </div>
      </div>`;
  }

  function adminReview() {
    return `
      <div class="app-chrome">
        ${topbar('Admin')}
        <div class="owner-console">
          <aside class="owner-side"><strong>Razumly Admin</strong><span>Dashboard</span><span>Stripe verification</span><span class="active">Organization claims · 4</span><span>Affiliate sources</span><span>Moderation</span></aside>
          <main class="owner-main">
            <h1>Ownership dispute · River City Sports Club</h1>
            <p>Compare independently sourced evidence before changing public state or ownership.</p>
            <div class="alert-box warning">${icons.alert}<div><strong>Pending intake — no public status change</strong>Mark the dispute credible only if the evidence justifies a formal ownership review.</div></div>
            <div class="admin-evidence-grid">
              <div class="evidence-card"><small>Requester</small><strong>Jordan Lee<br>Domain email verified</strong></div>
              <div class="evidence-card"><small>Current owner</small><strong>Taylor Morgan<br>Response received</strong></div>
              <div class="evidence-card"><small>Affiliate history</small><strong>Imported May 2026<br>No prior disputes</strong></div>
            </div>
            <article class="request-card">
              <h3>Independent evidence</h3>
              <p>Official leadership page names Jordan as program director. Official board page names Taylor as treasurer. The prior transfer request expired without response. Both emails use the organization domain.</p>
              <div class="decision-options">
                <div class="decision-option"><strong>Request information</strong>Ask either party for a public source or clarification.</div>
                <div class="decision-option"><strong>Mark dispute credible</strong>Show ownership under review and pause trust ranking boost.</div>
                <div class="decision-option"><strong>Uphold current owner</strong>Close the dispute without changing access or ownership.</div>
                <div class="decision-option"><strong>Approve transfer path</strong>Require final decision message and incoming-owner MFA.</div>
              </div>
              <div class="request-card-actions"><button class="button-primary" data-goto="DS-06">Mark credible</button><button class="button-secondary">Request information</button><button class="button-danger" data-goto="DS-07">Reject dispute</button></div>
            </article>
          </main>
        </div>
      </div>`;
  }

  function disputeResolution() {
    return wizard(
      'Ownership issue resolved',
      'The administrator’s decision is recorded and both parties receive the user-facing outcome.',
      4,
      `<section class="wizard-card">
        <div class="status-hero" style="padding-top:12px">
          <div class="status-icon success">✓</div>
          <h2>Current ownership upheld</h2>
          <p>The evidence confirms that the existing board account remains the proper owner. The contested transfer request is closed and both parties have received the decision.</p>
        </div>
        <div class="review-list">
          <div class="review-row"><div><strong>Organization owner</strong><span>Taylor Morgan remains owner</span></div><div class="review-value">Upheld</div></div>
          <div class="review-row"><div><strong>Requester</strong><span>Jordan Lee’s ownership-transfer request is closed</span></div><div class="review-value">Not transferred</div></div>
          <div class="review-row"><div><strong>Public ownership state</strong><span>Claimed profile · Website verified</span></div><div class="review-value">Trust restored</div></div>
          <div class="review-row"><div><strong>Audit record</strong><span>Decision, evidence classes, notifications, and actors retained</span></div><div class="review-value">Complete</div></div>
        </div>
        <div class="alert-box info" style="margin-top:14px">${icons.info}<div><strong>Other possible resolutions</strong>Initiate MFA ownership transfer, revoke the claim to unclaimed, suspend access for credible fraud, merge a duplicate, or correct the profile. Staff access remains owner-initiated from the organization’s Staff page.</div></div>
        ${actions('', 'Return to organization', 'EV-03')}
      </section>`,
      ['Issue', 'Evidence', 'Review', 'Resolution']
    );
  }

  const screens = [
    { id: 'EV-01', flow: 'event', title: 'Public event — unclaimed host', note: 'Adds ownership context to the host card without competing with the external registration action. The event remains usable even when nobody has claimed the organization.', tags: ['public', 'affiliate', 'unclaimed'], render: () => eventPage('unclaimed') },
    { id: 'EV-02', flow: 'event', title: 'Public event — claimed by affiliation', note: 'Shows a modest claimed signal and a secondary request-access path. It does not imply website control or payment verification.', tags: ['public', 'claimed', 'access'], render: () => eventPage('claimed') },
    { id: 'EV-03', flow: 'event', title: 'Public event — website verified', note: 'Separates “Claimed profile” from “Website verified.” The official organizer-site CTA remains the primary event action.', tags: ['public', 'site control', 'trust'], render: () => eventPage('verified') },
    { id: 'EV-04', flow: 'event', title: 'Public event — ownership under review', note: 'Appears only after an administrator marks a dispute credible. It removes the trust boost while preserving event details and the protected external action.', tags: ['public', 'disputed', 'no takeover'], render: () => eventPage('review') },
    { id: 'EV-05', flow: 'event', title: 'Public event — first-party organization', note: 'A normal BracketIQ-created organization has no claim prompt. Ownership machinery stays out of the public event experience.', tags: ['public', 'first-party', 'no CTA'], render: () => eventPage('firstparty') },

    { id: 'CR-01', flow: 'create', title: 'Creation — identity lookup', note: 'Moves name, official website, and location before the long organization form. Matching begins before the user invests in configuration.', tags: ['match-first', 'loading', 'privacy'], render: creationFind },
    { id: 'CR-02', flow: 'create', title: 'Creation — exact unclaimed match', note: 'Blocks duplicate creation and makes claiming the existing affiliate profile the clear next step.', tags: ['exact match', 'unclaimed', 'claim'], render: () => organizationMatch() },
    { id: 'CR-03', flow: 'create', title: 'Creation — exact claimed match', note: 'Routes to the existing profile, a consensual ownership transfer, or a genuine dispute. Staff access remains owner-initiated.', tags: ['exact match', 'claimed', 'no takeover'], render: () => organizationMatch({ claimed: true }) },
    { id: 'CR-04', flow: 'create', title: 'Creation — related or possible match', note: 'Allows legitimate sibling branches or similarly named organizations to continue only after explicit acknowledgement.', tags: ['soft match', 'acknowledgement', 'branch'], render: relatedMatch },
    { id: 'CR-05', flow: 'create', title: 'Creation — verified-domain conflict', note: 'Prevents a second profile from borrowing a verified website. Distinct branches require duplicate-profile review before creation.', tags: ['domain conflict', 'manual review', 'duplicate'], render: domainConflict },
    { id: 'CR-06', flow: 'create', title: 'Creation — organization details', note: 'The full form appears only after matching. The new owner can configure tools and visibility without receiving website verification merely for typing a URL.', tags: ['details', 'tax', 'tools'], render: creationDetails },
    { id: 'CR-07', flow: 'create', title: 'Creation — final review', note: 'Makes the ownership and website-verification distinction explicit before the final server-side duplicate check.', tags: ['review', 'server recheck', 'ownership'], render: creationReview },
    { id: 'CR-08', flow: 'create', title: 'Creation — race or stale match conflict', note: 'Demonstrates the structured 409 fallback when an exact profile appears after the initial lookup or a token becomes stale.', tags: ['409', 'race', 'API enforcement'], render: serverConflict },
    { id: 'CR-09', flow: 'create', title: 'Creation — success', note: 'A new organization is owned and claimed, but website verification remains none until a separate proof succeeds.', tags: ['success', 'claimed', 'not verified'], render: creationSuccess },

    { id: 'CL-00', flow: 'claim', title: 'Claim — sign-in and verified-account gate', note: 'Requires a verified BracketIQ account while allowing the claim-specific work email to differ from the login email.', tags: ['auth', 'email verification', 'gate'], render: accountGate },
    { id: 'CL-01', flow: 'claim', title: 'Claim — choose verification method', note: 'Presents domain email, DNS, HTML, and manual review together, with a clear warning about shared platforms.', tags: ['method selection', 'shared platform', 'proof'], render: claimMethods },
    { id: 'CL-02', flow: 'claim', title: 'Claim — work email', note: 'Verifies affiliation to the official registrable domain and explains that the address is claim evidence, not a new login email.', tags: ['domain email', 'affiliation', 'privacy'], render: workEmail },
    { id: 'CL-03', flow: 'claim', title: 'Claim — email sent', note: 'Covers expiry, single-use behavior, masked display, cross-account protection, and resending.', tags: ['email sent', 'expiry', 'single use'], render: emailSent },
    { id: 'CL-04', flow: 'claim', title: 'Claim — DNS TXT proof', note: 'Shows the exact bounded challenge without asking for DNS credentials. Successful proof earns website-control verification.', tags: ['DNS', 'site control', 'token'], render: dnsProof },
    { id: 'CL-05', flow: 'claim', title: 'Claim — HTML meta proof', note: 'Limits verification to the approved homepage and explains the shared-platform fallback to manual review.', tags: ['HTML', 'site control', 'safe fetch'], render: htmlProof },
    { id: 'CL-06', flow: 'claim', title: 'Claim — manual review form', note: 'Collects public, independently verifiable evidence while explicitly excluding sensitive identity, tax, and financial documents.', tags: ['manual review', 'evidence', 'privacy'], render: manualClaim },
    { id: 'CL-07', flow: 'claim', title: 'Claim — pending administrator review', note: 'Keeps the public profile unclaimed while administrators review. Request-for-information behavior is visible without exposing internal notes.', tags: ['pending', 'request info', 'no public change'], render: claimPending },
    { id: 'CL-08', flow: 'claim', title: 'Claim — MFA ownership acceptance', note: 'Separates approval from the actual ownership transfer and requires a purpose-scoped authenticator challenge.', tags: ['MFA', 'acceptance', 'security'], render: () => mfaAccept() },
    { id: 'CL-09', flow: 'claim', title: 'Claim — complete', note: 'Shows the benefits unlocked after transfer while preserving all affiliate events, teams, rentals, reviews, and outbound links.', tags: ['success', 'management', 'reviews'], render: claimSuccess },
    { id: 'CL-10', flow: 'claim', title: 'Claim — expired or rejected', note: 'Failure is recoverable and does not alter ownership. Rejection copy stays user-facing while internal evidence remains private.', tags: ['expired', 'rejected', 'retry'], render: claimFailure },

    { id: 'AC-01', flow: 'access', title: 'Claimed profile — ownership options', note: 'A claimed profile offers consensual ownership transfer or a genuine ownership dispute. It does not accept public staff-access requests.', tags: ['claimed', 'ownership', 'transfer'], render: accessChoices },
    { id: 'OW-01', flow: 'access', title: 'Owner management — staff list', note: 'Staff access begins inside organization management. Owners review current roles and start invitations for people they know.', tags: ['owner initiated', 'staff', 'roles'], render: ownerStaffList },
    { id: 'OW-02', flow: 'access', title: 'Owner management — add staff member', note: 'The owner enters the person’s email, chooses a role, reviews permissions, and sends the invitation.', tags: ['invite', 'least privilege', 'owner'], render: ownerAddStaff },
    { id: 'TR-01', flow: 'access', title: 'Claimed profile — transfer request', note: 'Records the intended consensual handoff and explains the two-party MFA requirement before submission.', tags: ['transfer', 'consent', 'two-party MFA'], render: transferRequest },
    { id: 'TR-02', flow: 'access', title: 'Transfer — current owner approval', note: 'The current owner sees the consequences and completes purpose-scoped MFA before an invitation reaches the incoming owner.', tags: ['current owner', 'MFA', 'approval'], render: ownerTransferMfa },
    { id: 'TR-03', flow: 'access', title: 'Transfer — incoming owner acceptance', note: 'The incoming owner separately accepts with MFA. Either half alone cannot transfer the organization.', tags: ['incoming owner', 'MFA', 'acceptance'], render: () => mfaAccept('Accept ownership transfer', true) },
    { id: 'TR-04', flow: 'access', title: 'Transfer — complete', note: 'Confirms the new owner, ends former owner-level access, preserves trust state, and records the audited handoff.', tags: ['complete', 'audit', 'notifications'], render: transferComplete },

    { id: 'DS-01', flow: 'dispute', title: 'Dispute — issue and desired outcome', note: 'Creates a structured dispute from the problem and requested outcome, avoiding a vague free-form “claim this claimed profile” action.', tags: ['reason', 'outcome', 'abuse prevention'], render: disputeStart },
    { id: 'DS-02', flow: 'dispute', title: 'Dispute — affiliation and evidence', note: 'Collects bounded public evidence and optionally website control. Strong proof informs review but never causes an automatic takeover.', tags: ['evidence', 'domain proof', 'no takeover'], render: disputeEvidence },
    { id: 'DS-03', flow: 'dispute', title: 'Dispute — review and certification', note: 'Links prior expired or denied requests, explains current-owner notification, and requires an accuracy certification before submission.', tags: ['certification', 'linked history', 'notify owner'], render: disputeReview },
    { id: 'DS-04', flow: 'dispute', title: 'Dispute — current owner response', note: 'Gives the current owner a fair, privacy-bounded response path while preserving their access during intake.', tags: ['owner response', 'due process', 'privacy'], render: disputeOwnerResponse },
    { id: 'DS-05', flow: 'dispute', title: 'Dispute — administrator review', note: 'Administrators compare independent evidence and explicitly decide whether the dispute is credible before changing public trust.', tags: ['admin', 'credibility', 'audit'], render: adminReview },
    { id: 'DS-06', flow: 'dispute', title: 'Dispute — credible public state', note: 'A credible dispute changes the public ownership signal and trust rank, but it does not hide events or automatically transfer ownership.', tags: ['public state', 'trust paused', 'event preserved'], render: () => eventPage('review') },
    { id: 'DS-07', flow: 'dispute', title: 'Dispute — resolution', note: 'Supports bounded ownership remedies: uphold, MFA transfer, revoke, suspend, merge, or correct. It never grants staff access from a public request.', tags: ['resolution', 'notifications', 'audit'], render: disputeResolution },
  ];

  const coverage = [
    ['Unlisted affiliate match', 'CR-02', 'Creation can find profiles that are not normally browsable.'],
    ['Privacy-safe match response', 'CR-02', 'Only public summary, approximate location, state, and reason codes appear.'],
    ['Exact unclaimed profile', 'CR-02', 'Duplicate creation is replaced by the initial claim path.'],
    ['Exact already-claimed profile', 'CR-03', 'Routes to the profile, ownership transfer, or ownership issue.'],
    ['Soft sibling match', 'CR-04', 'A distinct organization may continue after acknowledgement.'],
    ['Verified-domain conflict', 'CR-05', 'Shared parent sites require duplicate-profile review.'],
    ['Shared registration platform', 'CL-01', 'Cannot auto-verify ownership through a tenant platform.'],
    ['Final API duplicate check', 'CR-08', 'A stale token or concurrent create returns a recoverable conflict.'],
    ['New owner is not site verified', 'CR-09', 'Creating a profile does not grant a website badge.'],
    ['Signed-out claimant', 'CL-00', 'Sign-in and verified-account gate precedes evidence.'],
    ['Different login and work email', 'CL-02', 'Claim email does not replace the login email.'],
    ['Expired or replayed email link', 'CL-10', 'Fresh challenge required; no ownership change.'],
    ['Unsafe or unavailable website proof', 'CL-05', 'Manual review remains available.'],
    ['No sensitive manual documents', 'CL-06', 'Publicly verifiable evidence only.'],
    ['Pending and request information', 'CL-07', 'Public state remains unclaimed before approval.'],
    ['MFA not enrolled', 'CL-08', 'Setup happens before returning to acceptance.'],
    ['No public staff requests', 'AC-01', 'Claimed profiles only expose ownership transfer or dispute.'],
    ['Owner-initiated staffing', 'OW-01', 'Owners add known users from organization management.'],
    ['Role and permission review', 'OW-02', 'The inviter chooses the role before access is granted.'],
    ['Consensual ownership transfer', 'TR-02', 'Both current and incoming owners complete MFA.'],
    ['Denied or expired transfer', 'DS-01', 'Requester may escalate to a formal dispute.'],
    ['Unauthorized claim report', 'DS-01', 'A dedicated dispute reason supports fraud review.'],
    ['Duplicate-profile correction', 'DS-01', 'Disputes can request merge or correction, not only transfer.'],
    ['Current-owner response', 'DS-04', 'Owner gets notice without seeing private evidence.'],
    ['Abusive filing has no immediate effect', 'DS-03', 'Badge, access, and ranking remain until credibility review.'],
    ['Credible dispute', 'DS-06', 'Trust boost pauses; listings and outbound actions remain available.'],
    ['Multiple dispute outcomes', 'DS-07', 'Uphold, transfer, revoke, suspend, merge, or correct.'],
    ['Affiliate external action preserved', 'EV-01', 'Organizer-site registration remains the primary event CTA.'],
    ['First-party organization', 'EV-05', 'No public claim prompt is shown.'],
  ];

  let activeScreenId = 'EV-01';
  let activeFlow = 'all';
  let searchValue = '';

  const screenList = document.getElementById('screenList');
  const mockupScreen = document.getElementById('mockupScreen');
  const activeScreenIdNode = document.getElementById('activeScreenId');
  const activeFlowName = document.getElementById('activeFlowName');
  const noteTitle = document.getElementById('noteTitle');
  const noteBody = document.getElementById('noteBody');
  const noteTags = document.getElementById('noteTags');
  const mockupViewport = document.getElementById('mockupViewport');

  function filteredScreens() {
    return screens.filter((screen) => {
      const matchesFlow = activeFlow === 'all' || screen.flow === activeFlow;
      const haystack = `${screen.id} ${screen.title} ${screen.note} ${screen.tags.join(' ')}`.toLowerCase();
      return matchesFlow && haystack.includes(searchValue);
    });
  }

  function renderScreenList() {
    const groups = {};
    filteredScreens().forEach((screen) => {
      if (!groups[screen.flow]) groups[screen.flow] = [];
      groups[screen.flow].push(screen);
    });

    screenList.innerHTML = Object.entries(groups).map(([flow, items]) => `
      <div class="screen-list-group">
        <div class="screen-list-group-title"><span>${flowNames[flow]}</span><span>${items.length}</span></div>
        ${items.map((screen) => `
          <button class="screen-list-button ${screen.id === activeScreenId ? 'active' : ''}" data-screen="${screen.id}">
            <b>${screen.id}</b><span>${screen.title.replace(/^.*? — /, '')}</span>
          </button>`).join('')}
      </div>`).join('') || '<p style="padding:16px;color:#91a2b2;font-size:11px">No screens match this filter.</p>';
  }

  function selectScreen(id, updateHash = true) {
    const screen = screens.find((item) => item.id === id);
    if (!screen) return;
    activeScreenId = id;
    mockupScreen.innerHTML = screen.render();
    activeScreenIdNode.textContent = screen.id;
    activeFlowName.textContent = flowNames[screen.flow];
    noteTitle.textContent = screen.title;
    noteBody.textContent = screen.note;
    noteTags.innerHTML = screen.tags.map((tag) => `<span>${tag}</span>`).join('');
    renderScreenList();
    if (updateHash) {
      history.replaceState(null, '', `#${screen.id}`);
    }
    document.querySelectorAll('.flow-node').forEach((node) => {
      node.setAttribute('aria-current', node.dataset.screen === screen.id ? 'step' : 'false');
    });
  }

  document.addEventListener('click', (event) => {
    const screenButton = event.target.closest('[data-screen]');
    if (screenButton) {
      selectScreen(screenButton.dataset.screen);
      if (screenButton.closest('.flow-board')) {
        document.querySelector('.workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    const gotoButton = event.target.closest('[data-goto]');
    if (gotoButton) {
      selectScreen(gotoButton.dataset.goto);
      document.querySelector('.preview-toolbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const copyButton = event.target.closest('.copy-button');
    if (copyButton) {
      const original = copyButton.textContent;
      copyButton.textContent = 'Copied';
      window.setTimeout(() => { copyButton.textContent = original; }, 1200);
    }
  });

  document.getElementById('screenSearch').addEventListener('input', (event) => {
    searchValue = event.target.value.trim().toLowerCase();
    renderScreenList();
  });

  document.getElementById('flowFilters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-flow]');
    if (!button) return;
    activeFlow = button.dataset.flow;
    document.querySelectorAll('.filter-chip').forEach((chip) => chip.classList.toggle('active', chip === button));
    renderScreenList();
  });

  document.querySelector('.viewport-switch').addEventListener('click', (event) => {
    const button = event.target.closest('[data-viewport]');
    if (!button) return;
    document.querySelectorAll('.viewport-switch button').forEach((item) => item.classList.toggle('active', item === button));
    mockupViewport.classList.toggle('mobile', button.dataset.viewport === 'mobile');
    mockupViewport.classList.toggle('desktop', button.dataset.viewport === 'desktop');
  });

  document.getElementById('screenCount').textContent = String(screens.length);
  document.getElementById('edgeCount').textContent = String(coverage.length);
  document.getElementById('coverageCount').textContent = `${coverage.length} / ${coverage.length} represented`;
  document.getElementById('coverageGrid').innerHTML = coverage.map(([title, id, detail]) => `
    <button class="coverage-item" data-screen="${id}">
      <span class="coverage-check">✓</span>
      <span><strong>${title} · ${id}</strong><small>${detail}</small></span>
    </button>`).join('');

  const initialHash = window.location.hash.slice(1);
  selectScreen(screens.some((screen) => screen.id === initialHash) ? initialHash : activeScreenId, false);
})();
