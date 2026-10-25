---
title: An example case study
date: 2026-10-23
updated: 2026-10-25
slug: example-case-study
type: case-study
year: 2026
tag: Example · process automation
tags: [case-study, automation]
summary: A manual process took an hour a day. Now it takes none.
used:
  - { name: 'Node.js', url: 'https://nodejs.org' }
  - { name: 'Fastify', url: 'https://fastify.dev' }
impact: An hour a day back, and no more retyped orders.
---

<p>This is an example case study. It shows the shape the page takes, so you can replace it with your own work.</p>

<p>Start with the situation. Say who had the problem and what it cost them. Keep it to the facts a reader can check. Orders arrived by email and someone retyped each one by hand.</p>

<section class="figure fig-narrow">
  <p class="figure-title">The flow</p>
  <svg class="cellfig" viewBox="0 0 152 126" width="304" height="252" shape-rendering="crispEdges" role="img" aria-label="A vertical flow diagram. An order arrives by email, it is read off the PDF, and it is filed in the system. If any step fails, the order waits for a person."><path class="f-p" d="M0 0h152v22h-152z"/><path class="f-k" d="M0 0h152v1h-152zM0 21h152v1h-152zM0 1h1v20h-1zM151 1h1v20h-1z"/><text class="f-k" x="76" y="14.5" text-anchor="middle">an order arrives by email</text><path class="f-k" d="M76 22h1v5h-1zM73 26h1v1h-1zM74 26h1v1h-1zM75 26h1v1h-1zM76 26h1v1h-1zM77 26h1v1h-1zM78 26h1v1h-1zM79 26h1v1h-1zM74 27h1v1h-1zM75 27h1v1h-1zM76 27h1v1h-1zM77 27h1v1h-1zM78 27h1v1h-1zM75 28h1v1h-1zM76 28h1v1h-1zM77 28h1v1h-1zM76 29h1v1h-1z"/><path class="f-p" d="M0 30h152v22h-152z"/><path class="f-k" d="M0 30h152v1h-152zM0 51h152v1h-152zM0 31h1v20h-1zM151 31h1v20h-1z"/><text class="f-k" x="76" y="44.5" text-anchor="middle">read it off the PDF</text><path class="f-k" d="M76 52h1v5h-1zM73 56h1v1h-1zM74 56h1v1h-1zM75 56h1v1h-1zM76 56h1v1h-1zM77 56h1v1h-1zM78 56h1v1h-1zM79 56h1v1h-1zM74 57h1v1h-1zM75 57h1v1h-1zM76 57h1v1h-1zM77 57h1v1h-1zM78 57h1v1h-1zM75 58h1v1h-1zM76 58h1v1h-1zM77 58h1v1h-1zM76 59h1v1h-1z"/><path class="f-p" d="M0 60h152v22h-152z"/><path class="f-k" d="M0 60h152v1h-152zM0 81h152v1h-152zM0 61h1v20h-1zM151 61h1v20h-1z"/><text class="f-k" x="76" y="74.5" text-anchor="middle">file it in the system</text><path class="f-b" d="M0 90h152v36h-152z"/><path class="f-k" d="M0 90h152v1h-152zM0 125h152v1h-152zM0 91h1v34h-1zM151 91h1v34h-1z"/><text class="f-p" x="76" y="104.5" text-anchor="middle">any step fails: the order waits for</text><text class="f-p" x="76" y="118.5" text-anchor="middle">a person</text></svg>
  <p class="figure-note">Drawn on the cell by the figure script.</p>
</section>

<p>The parser reads the order with one small function in Node<sup class="footnote-ref"><a id="fnref-pdf" href="#fn-pdf">1</a></sup>. It <a class="ref" href="#read-order-L2">finds the plate</a> and <a class="ref" href="#read-order-L3">marks where the order came from</a>:</p>

```js id=read-order
function readOrder(text) {
  const plate = text.match(/Plate: (\S+)/)?.[1]
  return { plate, source: 'email' }
}
```

<p>Then say what you built. Name the parts plainly. A reader should be able to picture it working without a diagram, though a figure helps when the flow has more than three steps.</p>

<p>End with what changed. A number is better than an adjective. If it still runs, say since when.</p>

<section class="footnotes">
  <ol class="footnotes-list">
    <li id="fn-pdf" class="footnote-item">
      <p>A footnote points at public reference material, like the Mozilla PDF reader: <a href="https://mozilla.github.io/pdf.js/" target="_blank" rel="noopener">mozilla.github.io/pdf.js</a>. <a href="#fnref-pdf" class="footnote-backref">↩</a></p>
    </li>
  </ol>
</section>
