/* =========================================================
   PARTICLES
========================================================= */

const particleContainer =
    document.getElementById("particles");


for (let i = 0; i < 55; i++) {

    const particle =
        document.createElement("div");

    particle.className = "particle";

    particle.style.left =
        Math.random() * 100 + "%";

    particle.style.animationDuration =
        8 + Math.random() * 18 + "s";

    particle.style.animationDelay =
        -Math.random() * 20 + "s";

    particle.style.opacity =
        .15 + Math.random() * .45;

    particleContainer.appendChild(
        particle
    );
}


/* =========================================================
   REVEAL ON SCROLL
========================================================= */

const reveals =
    document.querySelectorAll(".reveal");


const revealObserver =
    new IntersectionObserver(

        entries => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {

                    entry.target
                        .classList
                        .add("visible");

                }

            });

        },

        {
            threshold: .12
        }

    );


reveals.forEach(element => {

    revealObserver.observe(element);

});


/* =========================================================
   SECTION TRACKING
========================================================= */

const sections =
    document.querySelectorAll(".section");

const sectionNumber =
    document.getElementById(
        "sectionNumber"
    );


const sectionObserver =
    new IntersectionObserver(

        entries => {

            entries.forEach(entry => {

                if (
                    entry.isIntersecting
                ) {

                    const number =
                        entry.target
                            .dataset
                            .section;

                    sectionNumber.textContent =
                        number;

                }

            });

        },

        {
            threshold: .55
        }

    );


sections.forEach(section => {

    sectionObserver.observe(section);

});


/* =========================================================
   SCROLL PROGRESS
========================================================= */

const progress =
    document.getElementById(
        "progress"
    );


window.addEventListener(
    "scroll",
    () => {

        const scrollTop =
            window.scrollY;

        const height =
            document.documentElement
                .scrollHeight -
            window.innerHeight;

        const percent =
            (scrollTop / height) * 100;

        progress.style.width =
            percent + "%";

    },
    {
        passive: true
    }
);


/* =========================================================
   PARALLAX DIAMONDS
========================================================= */

const diamonds =
    document.querySelectorAll(
        ".floating-diamond"
    );


window.addEventListener(
    "mousemove",
    event => {

        const x =
            (event.clientX /
                window.innerWidth -
                .5);

        const y =
            (event.clientY /
                window.innerHeight -
                .5);

        diamonds.forEach(
            (diamond, index) => {

                const strength =
                    (index + 1) * 12;

                diamond.style.transform =
                    `translate(
                        ${x * strength}px,
                        ${y * strength}px
                    )`;

            }
        );

    }
);


/* =========================================================
   MUSIC
========================================================= */

const music =
    document.getElementById(
        "music"
    );

const musicToggle =
    document.getElementById(
        "musicToggle"
    );

const musicIcon =
    document.getElementById(
        "musicIcon"
    );

const musicTitle =
    document.getElementById(
        "musicTitle"
    );

const musicStatus =
    document.getElementById(
        "musicStatus"
    );


let playing = false;


/*
    Browser autoplay policy:

    The audio starts muted.
    This means the browser is allowed
    to start it automatically.

    The user can then enable sound
    by clicking the glass notification.
*/


window.addEventListener(
    "load",
    async () => {

        music.muted = true;

        try {

            await music.play();

        } catch (error) {

            console.log(
                "Autoplay waiting for interaction"
            );

        }

    }
);


musicToggle.addEventListener(
    "click",
    async () => {

        if (!playing) {

            music.muted = false;

            try {

                await music.play();

            } catch (error) {

                console.log(error);

            }

            playing = true;

            musicToggle
                .classList
                .add("playing");

            musicIcon.textContent =
                "♫";

            musicTitle.textContent =
                "Music on";

            musicStatus.textContent =
                "در حال پخش";

        } else {

            music.muted = true;

            playing = false;

            musicToggle
                .classList
                .remove("playing");

            musicIcon.textContent =
                "◌";

            musicTitle.textContent =
                "Music off";

            musicStatus.textContent =
                "برای شنیدن روشنش کن";

        }

    }
);


/* =========================================================
   REDUCE MOTION
========================================================= */

const reducedMotion =
    window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    );


if (reducedMotion.matches) {

    document
        .querySelectorAll(
            ".reveal"
        )
        .forEach(
            element => {

                element.classList
                    .add("visible");

            }
        );

}
