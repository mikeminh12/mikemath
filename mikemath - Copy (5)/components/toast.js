// =========================
// MikeMath Toast
// =========================

class Toast {

    constructor() {

        this.container = document.createElement("div");

        this.container.id = "toast-container";

        document.body.appendChild(this.container);

    }

    show(message, type = "info", duration = 3000) {

        const toast = document.createElement("div");

        toast.className = `toast toast-${type}`;

        toast.innerHTML = `
            <span>${message}</span>
        `;

        this.container.appendChild(toast);

        requestAnimationFrame(() => {

            toast.classList.add("show");

        });

        setTimeout(() => {

            toast.classList.remove("show");

            setTimeout(() => {

                toast.remove();

            }, 300);

        }, duration);

    }

    success(message, duration = 3000) {

        this.show(message, "success", duration);

    }

    error(message, duration = 3000) {

        this.show(message, "error", duration);

    }

    warning(message, duration = 3000) {

        this.show(message, "warning", duration);

    }

    info(message, duration = 3000) {

        this.show(message, "info", duration);

    }

}

const toast = new Toast();

export default toast;