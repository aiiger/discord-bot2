// FaceitJS.js

// ***** IMPORTS ***** //

// CHAMPIONSHIPS
import getChampionships from './endpoints/championships/getChampionships.js';
import getChampionshipsById from './endpoints/championships/getChampionshipsById.js';
import getChampionshipsMatches from './endpoints/championships/getChampionshipsMatches.js';
import getChampionshipsSubscriptions from './endpoints/championships/getChampionshipsSubscriptions.js';
import getChampionshipsResults from './endpoints/championships/getChampionshipsResults.js';

// GAMES
import getGames from './endpoints/games/getGames.js';
import getGamesMatchmakings from './endpoints/games/getGamesMatchmakings.js';
import getGamesById from './endpoints/games/getGamesById.js';
import getGamesParent from './endpoints/games/getGamesParent.js';
import getGamesQueues from './endpoints/games/getGamesQueues.js';
import getGamesQueuesById from './endpoints/games/getGamesQueuesById.js';
import getGamesQueuesByIdBans from './endpoints/games/getGamesQueuesByIdBans.js';
import getGamesQueuesByIdByRegion from './endpoints/games/getGamesQueuesByIdByRegion.js';

// HUBS
import getHubsById from './endpoints/hubs/getHubsById.js';
import getHubsMatches from './endpoints/hubs/getHubsMatches.js';
import getHubsMembers from './endpoints/hubs/getHubsMembers.js';
import getHubsRoles from './endpoints/hubs/getHubsRoles.js';
import getHubsRules from './endpoints/hubs/getHubsRules.js';
import getHubsStats from './endpoints/hubs/getHubsStats.js';

// LEADERBOARDS
import getLeaderboardChampionships from './endpoints/leaderboards/getLeaderboardChampionships.js';
import getLeaderboardChampionshipsByGroup from './endpoints/leaderboards/getLeaderboardChampionshipsByGroup.js';
import getLeaderboardByHub from './endpoints/leaderboards/getLeaderboardByHub.js';
import getLeaderboardByHubGeneral from './endpoints/leaderboards/getLeaderboardByHubGeneral.js';
import getLeaderboardByHubBySeason from './endpoints/leaderboards/getLeaderboardByHubBySeason.js';
import getLeaderboardById from './endpoints/leaderboards/getLeaderboardById.js';
import getLeaderboardByIdByPlayer from './endpoints/leaderboards/getLeaderboardByIdByPlayer.js';

// LEAGUES
import getLeaguesById from './endpoints/leagues/getLeaguesById.js';
import getLeaguesBySeasonId from './endpoints/leagues/getLeaguesBySeasonId.js';
import getLeaguesByPlayersId from './endpoints/leagues/getLeaguesByPlayersId.js';

// MATCHES
import getMatchesById from './endpoints/matches/getMatchesById.js';
import getMatchesStats from './endpoints/matches/getMatchesStats.js';

// MATCHMAKINGS
import getMatchmakingsById from './endpoints/matchmakings/getMatchmakingsById.js';

// ORGANIZERS
import getOrganizers from './endpoints/organizers/getOrganizers.js';
import getOrganizersById from './endpoints/organizers/getOrganizersById.js';
import getOrganizersByIdChampionships from './endpoints/organizers/getOrganizersByIdChampionships.js';
import getOrganizersByIdGames from './endpoints/organizers/getOrganizersByIdGames.js';
import getOrganizersByIdHubs from './endpoints/organizers/getOrganizersByIdHubs.js';
import getOrganizersByIdTournaments from './endpoints/organizers/getOrganizersByIdTournaments.js';

// PLAYERS
import getPlayer from './endpoints/players/getPlayers.js';
import getPlayerById from './endpoints/players/getPlayersById.js';
import getPlayerHistory from './endpoints/players/getPlayerHistory.js';
import getPlayerHubs from './endpoints/players/getPlayerHubs.js';
import getPlayerStats from './endpoints/players/getPlayerStats.js';
import getPlayerTeams from './endpoints/players/getPlayerTeams.js';
import getPlayerTournaments from './endpoints/players/getPlayerTournaments.js';

// RANKINGS
import getRanking from './endpoints/rankings/getRanking.js';
import getPositionRanking from './endpoints/rankings/getPositionInRanking.js';

// SEARCH
import getSearchChampionships from './endpoints/search/getSearchChampionships.js';
import getSearchHubs from './endpoints/search/getSearchHubs.js';
import getSearchOrganizers from './endpoints/search/getSearchOrganizers.js';
import getSearchPlayers from './endpoints/search/getSearchPlayers.js';
import getSearchTeams from './endpoints/search/getSearchTeams.js';
import getSearchTournaments from './endpoints/search/getSearchTournaments.js';

// TEAMS
import getTeamsById from './endpoints/teams/getTeamsById.js';
import getTeamsStats from './endpoints/teams/getTeamsStats.js';
import getTeamsTournaments from './endpoints/teams/getTeamsTournaments.js';

// TOURNMENTS
import getTournaments from './endpoints/tournaments/getTournaments.js';
import getTournamentsById from './endpoints/tournaments/getTournamentsById.js';
import getTournamentsByIdBrackets from './endpoints/tournaments/getTournamentsByIdBrackets.js';
import getTournamentsByIdMatches from './endpoints/tournaments/getTournamentsByIdMatches.js';
import getTournamentsByIdTeams from './endpoints/tournaments/getTournamentsByIdTeams.js';

// CHAT API
// ROOM
import getRoomById from './endpoints/rooms/getRoomById.js';
import getRoomByIdMessages from './endpoints/rooms/getRoomByIdMessages.js';
import postRoomByIdMessage from './endpoints/rooms/postRoomByIdMessage.js';

// ***** FACEITJS CLASS ***** //

class FaceitJS {
  constructor(apiKeyServerSide, apiKeyClientSide) {
    this.apiKeyServer = apiKeyServerSide;
    this.apiKeyClient = apiKeyClientSide;
  }

  headers = {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${this.apiKeyServer}`,
    },
  };

  // Getter and Setter Methods
  getApiKeyServer() {
    return this.apiKeyServer;
  }

  setApiKeyServer(apiKeyServerSide) {
    this.apiKeyServer = apiKeyServerSide;
  }

  getApiKeyClient() {
    return this.apiKeyClient;
  }

  setApiKeyClient(apiKeyClientSide) {
    this.apiKeyClient = apiKeyClientSide;
  }

  getHeader() {
    return this.headers;
  }
}

// ***** ADD PROTOTYPE METHODS ***** //

// CHAMPIONSHIPS
FaceitJS.prototype.getChampionships = getChampionships;
FaceitJS.prototype.championships = getChampionships;

FaceitJS.prototype.getChampionshipsById = getChampionshipsById;
FaceitJS.prototype.championshipsById = getChampionshipsById;

// GAMES
FaceitJS.prototype.getGames = getGames;
FaceitJS.prototype.games = getGames;

FaceitJS.prototype.getGamesMatchmakings = getGamesMatchmakings;
FaceitJS.prototype.gamesMatchmakings = getGamesMatchmakings;

// HUBS
FaceitJS.prototype.getHubsById = getHubsById;
FaceitJS.prototype.getHubById = getHubsById;
FaceitJS.prototype.hubsById = getHubsById;
FaceitJS.prototype.hubById = getHubsById;

FaceitJS.prototype.getHubsMatches = getHubsMatches;
FaceitJS.prototype.hubsMatches = getHubsMatches;

FaceitJS.prototype.getHubsMembers = getHubsMembers;
FaceitJS.prototype.hubsMembers = getHubsMembers;

FaceitJS.prototype.getHubsRoles = getHubsRoles;
FaceitJS.prototype.hubsRoles = getHubsRoles;

FaceitJS.prototype.getHubsRules = getHubsRules;
FaceitJS.prototype.hubsRules = getHubsRules;

FaceitJS.prototype.getHubsStats = getHubsStats;
FaceitJS.prototype.hubsStats = getHubsStats;

// LEADERBOARDS
FaceitJS.prototype.getLeaderboardChampionships = getLeaderboardChampionships;
FaceitJS.prototype.leaderboardChampionships = getLeaderboardChampionships;

FaceitJS.prototype.getLeaderboardChampionshipsByGroup = getLeaderboardChampionshipsByGroup;
FaceitJS.prototype.leaderboardChampionshipsByGroup = getLeaderboardChampionshipsByGroup;

FaceitJS.prototype.getLeaderboardByHub = getLeaderboardByHub;
FaceitJS.prototype.leaderboardByHub = getLeaderboardByHub;
FaceitJS.prototype.getLeaderboardByHubId = getLeaderboardByHub;
FaceitJS.prototype.leaderboardByHubId = getLeaderboardByHub;

FaceitJS.prototype.getLeaderboardByHubGeneral = getLeaderboardByHubGeneral;
FaceitJS.prototype.leaderboardByHubGeneral = getLeaderboardByHubGeneral;
FaceitJS.prototype.getLeaderboardByHubIdGeneral = getLeaderboardByHubGeneral;
FaceitJS.prototype.leaderboardByHubIdGeneral = getLeaderboardByHubGeneral;

FaceitJS.prototype.getLeaderboardByHubBySeason = getLeaderboardByHubBySeason;
FaceitJS.prototype.leaderboardByHubBySeason = getLeaderboardByHubBySeason;
FaceitJS.prototype.getLeaderboardByHubBySeason = getLeaderboardByHubBySeason;
FaceitJS.prototype.leaderboardByHubBySeason = getLeaderboardByHubBySeason;

FaceitJS.prototype.getLeaderboardById = getLeaderboardById;
FaceitJS.prototype.leaderboardById = getLeaderboardById;

FaceitJS.prototype.getLeaderboardByIdByPlayer = getLeaderboardByIdByPlayer;
FaceitJS.prototype.leaderboardByIdByPlayer = getLeaderboardByIdByPlayer;
FaceitJS.prototype.getLeaderboardByPlayer = getLeaderboardByIdByPlayer;
FaceitJS.prototype.leaderboardByPlayer = getLeaderboardByIdByPlayer;

// LEAGUES
FaceitJS.prototype.getLeaguesById = getLeaguesById;
FaceitJS.prototype.getLeagueById = getLeaguesById;
FaceitJS.prototype.leaguesById = getLeaguesById;
FaceitJS.prototype.leagueById = getLeaguesById;

FaceitJS.prototype.getLeaguesBySeasonId = getLeaguesBySeasonId;
FaceitJS.prototype.getLeagueBySeasonId = getLeaguesBySeasonId;
FaceitJS.prototype.leaguesBySeasonId = getLeaguesBySeasonId;
FaceitJS.prototype.leagueBySeasonId = getLeaguesBySeasonId;

FaceitJS.prototype.getLeaguesByPlayersId = getLeaguesByPlayersId;
FaceitJS.prototype.getLeagueByPlayersId = getLeaguesByPlayersId;
FaceitJS.prototype.leaguesByPlayersId = getLeaguesByPlayersId;
FaceitJS.prototype.leagueByPlayersId = getLeaguesByPlayersId;

// MATCHES
FaceitJS.prototype.getMatchesById = getMatchesById;
FaceitJS.prototype.getMatchById = getMatchesById;
FaceitJS.prototype.matchesById = getMatchesById;
FaceitJS.prototype.matchById = getMatchesById;

FaceitJS.prototype.getMatchesStats = getMatchesStats;
FaceitJS.prototype.matchesStats = getMatchesStats;

// MATCHMAKINGS
FaceitJS.prototype.getMatchmakingsById = getMatchmakingsById;
FaceitJS.prototype.matchmakingsById = getMatchmakingsById;

// ORGANIZERS
FaceitJS.prototype.getOrganizers = getOrganizers;
FaceitJS.prototype.organizers = getOrganizers;

FaceitJS.prototype.getOrganizersById = getOrganizersById;
FaceitJS.prototype.organizersById = getOrganizersById;

FaceitJS.prototype.getOrganizersByIdChampionships = getOrganizersByIdChampionships;
FaceitJS.prototype.organizersByIdChampionships = getOrganizersByIdChampionships;

FaceitJS.prototype.getOrganizersByIdGames = getOrganizersByIdGames;
FaceitJS.prototype.organizersByIdGames = getOrganizersByIdGames;

FaceitJS.prototype.getOrganizersByIdHubs = getOrganizersByIdHubs;
FaceitJS.prototype.irganizersByIdHubs = getOrganizersByIdHubs;

FaceitJS.prototype.getOrganizersByIdTournaments = getOrganizersByIdTournaments;
FaceitJS.prototype.organizersByIdTournaments = getOrganizersByIdTournaments;

// PLAYERS
FaceitJS.prototype.getPlayer = getPlayer;
FaceitJS.prototype.player = getPlayer;

FaceitJS.prototype.getPlayerById = getPlayerById;
FaceitJS.prototype.playerById = getPlayerById;

FaceitJS.prototype.getPlayerHistory = getPlayerHistory;
FaceitJS.prototype.playerHistory = getPlayerHistory;

FaceitJS.prototype.getPlayerHubs = getPlayerHubs;
FaceitJS.prototype.playerHubs = getPlayerHubs;

FaceitJS.prototype.getPlayerStats = getPlayerStats;
FaceitJS.prototype.playerStats = getPlayerStats;

FaceitJS.prototype.getPlayerTeams = getPlayerTeams;
FaceitJS.prototype.playerTeams = getPlayerTeams;

FaceitJS.prototype.getPlayerTournaments = getPlayerTournaments;
FaceitJS.prototype.playerTournaments = getPlayerTournaments;

// RANKINGS
FaceitJS.prototype.getRanking = getRanking;
FaceitJS.prototype.ranking = getRanking;

FaceitJS.prototype.getPositionRanking = getPositionRanking;
FaceitJS.prototype.getPositionPlayer = getPositionRanking;

// SEARCH
FaceitJS.prototype.getSearchChampionships = getSearchChampionships;
FaceitJS.prototype.searchChampionships = getSearchChampionships;

FaceitJS.prototype.getSearchHubs = getSearchHubs;
FaceitJS.prototype.searchHubs = getSearchHubs;

FaceitJS.prototype.getSearchOrganizers = getSearchOrganizers;
FaceitJS.prototype.searchOrganizers = getSearchOrganizers;

FaceitJS.prototype.getSearchPlayers = getSearchPlayers;
FaceitJS.prototype.searchPlayers = getSearchPlayers;

FaceitJS.prototype.getSearchTeams = getSearchTeams;
FaceitJS.prototype.searchTeams = getSearchTeams;

FaceitJS.prototype.getSearchTournaments = getSearchTournaments;
FaceitJS.prototype.searchTournaments = getSearchTournaments;

// TEAMS
FaceitJS.prototype.getTeamsById = getTeamsById;
FaceitJS.prototype.getTeamById = getTeamsById;
FaceitJS.prototype.teamsById = getTeamsById;
FaceitJS.prototype.teamById = getTeamsById;

FaceitJS.prototype.getTeamsStats = getTeamsStats;
FaceitJS.prototype.teamsStats = getTeamsStats;

FaceitJS.prototype.getTeamsTournaments = getTeamsTournaments;
FaceitJS.prototype.teamsTournaments = getTeamsTournaments;

// TOURNMENTS
FaceitJS.prototype.getTournaments = getTournaments;
FaceitJS.prototype.tournaments = getTournaments;

FaceitJS.prototype.getTournamentsById = getTournamentsById;
FaceitJS.prototype.tournamentsById = getTournamentsById;
FaceitJS.prototype.getTournamentById = getTournamentsById;
FaceitJS.prototype.tournamentById = getTournamentsById;

FaceitJS.prototype.getTournamentsByIdBrackets = getTournamentsByIdBrackets;
FaceitJS.prototype.tournamentsByIdBrackets = getTournamentsByIdBrackets;
FaceitJS.prototype.getTournamentsBrackets = getTournamentsByIdBrackets;
FaceitJS.prototype.tournamentsBrackets = getTournamentsByIdBrackets;

FaceitJS.prototype.getTournamentsByIdMatches = getTournamentsByIdMatches;
FaceitJS.prototype.tournamentsByIdMatches = getTournamentsByIdMatches;
FaceitJS.prototype.getTournamentsMatches = getTournamentsByIdMatches;
FaceitJS.prototype.tournamentsMatches = getTournamentsByIdMatches;

FaceitJS.prototype.getTournamentsByIdTeams = getTournamentsByIdTeams;
FaceitJS.prototype.ournamentsByIdTeams = getTournamentsByIdTeams;
FaceitJS.prototype.getTournamentsTeams = getTournamentsByIdTeams;
FaceitJS.prototype.ournamentsTeams = getTournamentsByIdTeams;

// CHAT API
// ROOM
FaceitJS.prototype.getRoomById = getRoomById;
FaceitJS.prototype.roomById = getRoomById;

FaceitJS.prototype.getRoomByIdMessages = getRoomByIdMessages;
FaceitJS.prototype.roomByIdMessages = getRoomByIdMessages;

FaceitJS.prototype.postRoomByIdMessage = postRoomByIdMessage;
FaceitJS.prototype.roomByIdMessage = postRoomByIdMessage;
FaceitJS.prototype.postRoomMessage = postRoomByIdMessage;
FaceitJS.prototype.roomMessage = postRoomByIdMessage;
FaceitJS.prototype.postMessage = postRoomByIdMessage;
FaceitJS.prototype.message = postRoomByIdMessage;

// ***** EXPORT THE FACEITJS CLASS ***** //

export default FaceitJS;