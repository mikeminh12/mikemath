async function loadComponent(id, path) {
    const element = document.getElementById(id);

    if (!element) return;

    try {
        const response = await fetch(path);

        if (!response.ok) {
            throw new Error(`Không thể tải ${path}`);
        }

        element.innerHTML = await response.text();
    } catch (error) {
        console.error(error);
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    await Promise.all([
        loadComponent("navbar", "components/nav.html"),
        loadComponent("footer", "components/footer.html")
    ]);
    await import("/components/nav.js");
});