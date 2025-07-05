export const listGrids = /* GraphQL */ `
  query ListGrids(
    $filter: ModelGridFilterInput
    $limit: Int
    $nextToken: String
    $sort: ModelGridSortInput
  ) {
    listGrids(filter: $filter, limit: $limit, nextToken: $nextToken, sort: $sort) {
      items {
        id
        videos
        isActive
        status
        completedAt
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;
