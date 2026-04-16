
import { searchMedia } from "../src/lib/tmdb";

async function testSearch() {
  console.log("Testing search for 'cars'...");
  try {
    const { results } = await searchMedia("cars");
    console.log(`Found ${results.length} results.`);
    results.slice(0, 5).forEach((item, index) => {
      console.log(`${index + 1}. [${item.mediaType}] ${item.title} (${item.releaseYear}) - Pop: ${item.popularity}, Rating: ${item.rating}, Votes: ${item.voteCount}`);
    });
    
    if (results[0].title.toLowerCase() === "cars" && results[0].releaseYear === 2006) {
      console.log("SUCCESS: Pixar's Cars is the top result.");
    } else {
      console.log("ISSUE: Top result is not as expected.");
    }
  } catch (err) {
    console.error("Search failed:", err);
  }
}

testSearch();
