/** 滚动显现；尊重 prefers-reduced-motion */
(function () {
  const nodes = document.querySelectorAll('.feature, .stack-grid .ph, .cta, .hero-copy, .ph-hero')
  nodes.forEach((el) => el.classList.add('reveal'))

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    nodes.forEach((el) => el.classList.add('is-in'))
    return
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in')
          io.unobserve(entry.target)
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
  )

  nodes.forEach((el) => io.observe(el))
})()
