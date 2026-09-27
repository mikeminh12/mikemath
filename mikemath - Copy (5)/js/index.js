async function loadComponent(id, path) {
    const element = document.getElementById(id);

    const response = await fetch(path);

    element.innerHTML = await response.text();
}

loadComponent("navbar", "components/nav.html");

loadComponent("footer", "components/footer.html");