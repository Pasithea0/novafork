function handleError(message, error, showAlert = false) {
    console.error(message, error);
    if (showAlert) {
        alert(message);
    }
}

async function getApiKey() {
    try {
        const response = await fetch('apis/config.json');
        if (!response.ok) {
            throw new Error('Failed to load API key config.');
        }
        const config = await response.json();
        return config.apiKey;
    } catch (error) {
        handleError('Failed to fetch API key.', error);
        return null;
    }
}

async function fetchGenres(apiKey) {
    try {
        const response = await fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${apiKey}&language=en-US`);
        if (!response.ok) {
            throw new Error('Failed to fetch genres.');
        }
        const data = await response.json();
        return data.genres;
    } catch (error) {
        handleError('An error occurred while fetching genres:', error);
        return [];
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    const homePage = document.getElementById('homePage');
    const closeBanner = document.getElementById('closeBanner');
    const categorySelect = document.getElementById('categorySelect');
    const videoPlayerContainer = document.getElementById('videoPlayerContainer');
    const videoPlayer = document.getElementById('videoPlayer');
    const posterImage = document.getElementById('posterImage');

    if (closeBanner) {
        closeBanner.addEventListener('click', () => {
            welcomeBanner.style.display = 'none';
        });
    }

    if (homePage) {
        homePage.classList.remove('hidden');
    }

    const searchInput = document.getElementById('searchInput');
    const searchSuggestions = document.getElementById('searchSuggestions');

    if (searchInput) {
        document.getElementById('searchButton').addEventListener('click', search);
        searchInput.addEventListener('keydown', async function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                search();
            }
        });

        searchInput.addEventListener('input', async function () {
            const query = searchInput.value;
            if (query.length > 2) {
                const selectedCategory = categorySelect.value;
                const response = await fetch(`https://api.themoviedb.org/3/search/${selectedCategory}?api_key=${API_KEY}&query=${query}`);
                if (response.ok) {
                    const data = await response.json();
                    displaySearchSuggestions(data.results);
                } else {
                    searchSuggestions.classList.add('hidden');
                }
            } else {
                searchSuggestions.classList.add('hidden');
            }
        });
    }

    const API_KEY = await getApiKey();
    if (!API_KEY) return;

    const genres = await fetchGenres(API_KEY);
    const genreMap = genres.reduce((map, genre) => {
        map[genre.id] = genre.name;
        return map;
    }, {});

    genreMap[80] = 'Crime';

    async function search() {
        const searchInputValue = searchInput.value;
        const selectedCategory = categorySelect.value;
        const response = await fetch(`https://api.themoviedb.org/3/search/${selectedCategory}?api_key=${API_KEY}&query=${searchInputValue}`);

        if (response.ok) {
            const data = await response.json();

            // Display search results in the search results container
            displaySearchResults(data.results);

            searchSuggestions.classList.add('hidden');

            const newUrl = `${window.location.origin}${window.location.pathname}?query=${encodeURIComponent(searchInputValue)}&category=${selectedCategory}`;
            window.history.pushState({ searchInputValue, selectedCategory }, '', newUrl);
        } else {
            handleError('Failed to fetch search results.');
        }
    }

    async function fetchSelectedMedia(mediaId, mediaType) {
        try {
            const response = await fetch(`https://api.themoviedb.org/3/${mediaType}/${mediaId}?api_key=${API_KEY}`);
            if (response.ok) {
                const media = await response.json();

                const releaseType = await getReleaseType(mediaId, mediaType);

                const titleSlug = media.title ? media.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : media.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                const newUrl = `${window.location.origin}${window.location.pathname}?title=${encodeURIComponent(titleSlug)}`;
                window.history.pushState({ mediaId, mediaType, title: media.title || media.name }, '', newUrl);

                displaySelectedMedia(media, mediaType, releaseType);
                await fetchMediaTrailer(mediaId, mediaType);

                if (posterImage && media.poster_path) {
                    posterImage.src = `https://image.tmdb.org/t/p/w300${media.poster_path}`;
                    posterImage.alt = media.title || media.name;
                }

                videoPlayerContainer.classList.remove('hidden');
            } else {
                handleError('Failed to fetch media details.', new Error('API response not OK'));
                videoPlayerContainer.classList.add('hidden');
            }
        } catch (error) {
            handleError('An error occurred while fetching media details.', error);
            videoPlayerContainer.classList.add('hidden');
        }
    }
    async function getReleaseType(mediaId, mediaType) {
        try {
            const [releaseDatesResponse, watchProvidersResponse] = await Promise.all([
                fetch(`https://api.themoviedb.org/3/${mediaType}/${mediaId}/release_dates?api_key=${API_KEY}`),
                fetch(`https://api.themoviedb.org/3/${mediaType}/${mediaId}/watch/providers?api_key=${API_KEY}`)
            ]);

            if (releaseDatesResponse.ok && watchProvidersResponse.ok) {
                const releaseDatesData = await releaseDatesResponse.json();
                const watchProvidersData = await watchProvidersResponse.json();

                const releases = releaseDatesData.results.flatMap(result => result.release_dates);
                const currentDate = new Date();

                const isDigitalRelease = releases.some(release =>
                    (release.type === 4 || release.type === 6) && new Date(release.release_date) <= currentDate
                );

                const isInTheaters = mediaType === 'movie' && releases.some(release =>
                    release.type === 3 && new Date(release.release_date) <= currentDate
                );

                const hasFutureRelease = releases.some(release =>
                    new Date(release.release_date) > currentDate
                );

                const streamingProviders = watchProvidersData.results?.US?.flatrate || [];
                const isStreamingAvailable = streamingProviders.length > 0;

                if (isStreamingAvailable) {
                    return "Streaming (HD)";
                } else if (isDigitalRelease) {
                    return "HD";
                } else if (isInTheaters && mediaType === 'movie') {
                    const theatricalRelease = releases.find(release => release.type === 3);
                    if (theatricalRelease && new Date(theatricalRelease.release_date) <= currentDate) {
                        const releaseDate = new Date(theatricalRelease.release_date);
                        const oneYearLater = new Date(releaseDate);
                        oneYearLater.setFullYear(releaseDate.getFullYear() + 1);

                        if (currentDate >= oneYearLater) {
                            return "HD";
                        } else {
                            return "Cam Quality";
                        }
                    }
                } else if (hasFutureRelease) {
                    return "Not Released Yet";
                }

                return "Unknown Quality";
            } else {
                handleError('Failed to fetch release type or watch providers.', new Error('API response not OK'));
                return "Unknown Quality";
            }
        } catch (error) {
            handleError('An error occurred while fetching release type.', error);
            return "Unknown Quality";
        }
    }

    async function fetchMediaTrailer(mediaId, mediaType) {
        try {
            const response = await fetch(`https://api.themoviedb.org/3/${mediaType}/${mediaId}/videos?api_key=${API_KEY}`);
            if (response.ok) {
                const data = await response.json();
                const trailer = data.results.find(video => video.type === 'Trailer' && video.site === 'YouTube');
                if (trailer) {
                    videoPlayer.src = `https://www.youtube.com/embed/${trailer.key}`;
                } else {
                    videoPlayer.src = '';
                    videoPlayerContainer.classList.add('hidden');
                }
            } else {
                handleError('Failed to fetch media trailer.', new Error('API response not OK'));
                videoPlayerContainer.classList.add('hidden');
            }
        } catch (error) {
            handleError('An error occurred while fetching media trailer.', error);
            videoPlayerContainer.classList.add('hidden');
        }
    }


    function displaySearchResults(results) {
        const searchResultsContainer = document.getElementById('searchResultsContainer');
        searchResultsContainer.innerHTML = '';
        results.forEach(result => {
            const resultCard = document.createElement('div');
            resultCard.classList.add('result-card');
            resultCard.innerHTML = `
                <img src="https://image.tmdb.org/t/p/w500${result.poster_path}" alt="${result.title || result.name}">
                <h3>${result.title || result.name}</h3>
                <p>Release Date: ${result.release_date || result.first_air_date}</p>
            `;
            searchResultsContainer.appendChild(resultCard);
        });
    }

    function displaySearchSuggestions(results) {
        searchSuggestions.innerHTML = '';
        results.forEach(result => {
            const suggestionItem = document.createElement('li');
            suggestionItem.textContent = result.title || result.name;
            suggestionItem.addEventListener('click', () => {
                searchInput.value = suggestionItem.textContent;
                search();
                searchSuggestions.classList.add('hidden');
            });
            searchSuggestions.appendChild(suggestionItem);
        });
        searchSuggestions.classList.remove('hidden');
    }

    async function loadMediaFromUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const title = urlParams.get('title');

        if (title) {
            // Convert the title slug back to a format you can use to fetch media
            const response = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(title)}`);
            if (response.ok) {
                const data = await response.json();
                const media = data.results.find(item => (item.title && item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') === title) || (item.name && item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === title));
                if (media) {
                    const mediaType = media.media_type || (media.title ? 'movie' : 'tv');
                    await fetchSelectedMedia(media.id, mediaType);
                }
            }
        }
    }

    loadMediaFromUrlParams();
});
