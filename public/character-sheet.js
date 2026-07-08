function formatCharacterStatRows(player) {
    return [
        ["Level", player.level ?? 1],
        ["HP", `${player.hp} / ${player.maxHp}`],
        ["Gold", `$${player.money}`]
    ];
}

function renderCharacterSheet(container, player) {
    const rows = formatCharacterStatRows(player);

    container.innerHTML = "";

    const name = document.createElement("strong");
    name.className = "character-name";
    name.textContent = player.username;
    container.appendChild(name);

    const title = document.createElement("span");
    title.className = "character-title";
    title.textContent = "Novice Adventurer";
    container.appendChild(title);

    const rowList = document.createElement("dl");
    rowList.className = "character-stat-list";

    rows.forEach(([label, value]) => {
        const term = document.createElement("dt");
        term.textContent = label;

        const detail = document.createElement("dd");
        detail.textContent = value;

        rowList.append(term, detail);
    });

    container.appendChild(rowList);

    const button = document.createElement("button");
    button.className = "character-see-all-button";
    button.type = "button";
    button.textContent = "See All";
    container.appendChild(button);
}
